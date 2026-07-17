import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type GmailClient,
  type GmailLabel,
  type GmailMessage,
  processInbox,
  routeAttachment,
} from "@/lib/workflows/gmail-pipeline";
import { ingestReceipt, ingestStatement } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";

const FX = "../../../packages/shared/src/parsers/__fixtures__";
const fixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`${FX}/${f}`, import.meta.url)), "utf8");

const handlers = { ingestStatement, ingestReceipt };
let userId = "";

/** In-memory Gmail. listInbox() hides already-labelled messages → drives idempotency. */
class FakeGmail implements GmailClient {
  labels = new Map<string, GmailLabel>();
  constructor(private messages: (GmailMessage & { texts: Record<string, string> })[]) {}
  async listInbox() {
    return this.messages.filter((m) => !this.labels.has(m.id)).map(({ texts: _t, ...m }) => m);
  }
  async getAttachmentText(id: string, att: { filename: string }) {
    return this.messages.find((m) => m.id === id)!.texts[att.filename]!;
  }
  async label(id: string, l: GmailLabel) {
    this.labels.set(id, l);
  }
}

beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("routeAttachment (§4.1)", () => {
  it("routes by filename prefix", () => {
    expect(routeAttachment("DpsStatement149.pdf")).toBe("NLB");
    expect(routeAttachment("Transaction__FQ99.pdf")).toBe("META");
    expect(routeAttachment("random.pdf")).toBeNull();
  });
  it("falls back to the sender when the filename is generic", () => {
    expect(routeAttachment("scan.pdf", "izvodi@nlb.mk")).toBe("NLB");
    expect(routeAttachment("receipt.pdf", "noreply@facebookmail.com")).toBe("META");
  });
});

describe("processInbox (§4.1)", () => {
  it("routes a statement + a receipt, ingests both, labels Processed", async () => {
    const gmail = new FakeGmail([
      {
        id: "msg-statement",
        from: "izvodi@nlb.mk",
        attachments: [{ attachmentId: "a1", filename: "DpsStatement149.pdf" }],
        texts: { "DpsStatement149.pdf": fixture("nlb-149.txt") },
      },
      {
        id: "msg-receipt",
        from: "noreply@facebookmail.com",
        attachments: [{ attachmentId: "a2", filename: "Transaction__AAAA111111.pdf" }],
        texts: { "Transaction__AAAA111111.pdf": fixture("meta-1.txt") },
      },
    ]);

    const summary = await processInbox(gmail, handlers, userId);
    expect(summary).toMatchObject({
      messages: 2,
      processed: 2,
      failed: 0,
      statements: 1,
      receipts: 1,
    });
    expect(gmail.labels.get("msg-statement")).toBe("Processed");
    expect(gmail.labels.get("msg-receipt")).toBe("Processed");
    expect(await prisma.bankStatementImport.count()).toBe(1);
    expect(await prisma.adSpendReceipt.count()).toBe(1);
  });

  it("is idempotent: a re-poll processes nothing (labelled messages are hidden)", async () => {
    const gmail = new FakeGmail([
      {
        id: "msg-statement",
        from: "izvodi@nlb.mk",
        attachments: [{ attachmentId: "a1", filename: "DpsStatement149.pdf" }],
        texts: { "DpsStatement149.pdf": fixture("nlb-149.txt") },
      },
    ]);
    await processInbox(gmail, handlers, userId);
    const second = await processInbox(gmail, handlers, userId);
    expect(second.messages).toBe(0);
    expect(await prisma.bankStatementImport.count()).toBe(1); // not 2
  });

  it("labels a message Failed when a statement fails the integrity gate (B14 → manual queue)", async () => {
    const tampered = fixture("nlb-146.txt").replace(
      "100.000,00900,0020.000,00119.100,0011",
      "100.000,00900,0099.000,00119.100,0011",
    );
    const gmail = new FakeGmail([
      {
        id: "msg-bad",
        from: "izvodi@nlb.mk",
        attachments: [{ attachmentId: "a1", filename: "DpsStatement146.pdf" }],
        texts: { "DpsStatement146.pdf": tampered },
      },
    ]);
    const summary = await processInbox(gmail, handlers, userId);
    expect(summary).toMatchObject({ failed: 1, processed: 0 });
    expect(gmail.labels.get("msg-bad")).toBe("Failed");
    expect(await prisma.statementLine.count()).toBe(0); // nothing posted
  });

  it("leaves a message with no routable attachment untouched", async () => {
    const gmail = new FakeGmail([
      {
        id: "msg-other",
        from: "someone@example.com",
        attachments: [{ attachmentId: "a1", filename: "invoice-from-vendor.pdf" }],
        texts: { "invoice-from-vendor.pdf": "irrelevant" },
      },
    ]);
    const summary = await processInbox(gmail, handlers, userId);
    expect(summary.messages).toBe(0);
    expect(gmail.labels.size).toBe(0);
  });
});

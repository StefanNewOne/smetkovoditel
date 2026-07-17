import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { ingestStatement, ingestReceipt, runMatching } from "@/lib/workflows/w2";
import { prisma, resetDb } from "./setup/db";

/**
 * W2 import + matching (Master Plan §4). Uses the committed REDACTED golden fixtures (no live
 * financial data). Asserts the load-bearing invariants: integrity gate (B14), layered dedupe
 * (B13), reference-only Meta matching booking MKD 1:1 (D3/§4.4), billable-iff-AdAccount (B2),
 * and idempotency (re-import/re-match posts nothing new — B13/B15).
 */
const FX = "../../../packages/shared/src/parsers/__fixtures__";
const fixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`${FX}/${f}`, import.meta.url)), "utf8");

let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("W2 — NLB statement ingest & integrity gate", () => {
  it("ingests a valid 7-line statement (149): PARSED, lines persisted, CARD_TX auto-categorized", async () => {
    // Vendor rules (SM-51) drive CARD_TX → category (e.g. MAKPETROL → FUEL).
    await prisma.vendorRule.createMany({
      data: [
        { pattern: "MAKPETROL", category: "FUEL", vendor: "Makpetrol" },
        { pattern: "LUKOIL", category: "FUEL", vendor: "Lukoil" },
      ],
    });
    const res = await ingestStatement(
      fixture("nlb-149.txt"),
      "upload:149",
      "MANUAL_UPLOAD",
      userId,
    );
    expect(res.status).toBe("PARSED");
    if (res.status !== "PARSED") return;
    expect(res.statementNumber).toBe(149);
    expect(res.lines).toBe(7);

    const imp = await prisma.bankStatementImport.findFirstOrThrow();
    expect(imp.status).toBe("PARSED");
    expect(await prisma.statementLine.count()).toBe(7);
    // The seeded MAKPETROL/LUKOIL vendor rules categorize the 2 CARD_TX lines → FUEL expenses.
    const fuel = await prisma.expense.findMany({ where: { category: "FUEL" } });
    expect(fuel.length).toBeGreaterThanOrEqual(1);
  });

  it("B14: a tampered statement FAILS the integrity gate and posts NOTHING", async () => {
    // Break the credit total in the header so opening − debit + credit ≠ closing.
    const tampered = fixture("nlb-146.txt").replace(
      "100.000,00900,0020.000,00119.100,0011",
      "100.000,00900,0099.000,00119.100,0011",
    );
    const res = await ingestStatement(tampered, "upload:146-bad", "MANUAL_UPLOAD", userId);
    expect(res.status).toBe("FAILED");

    // The import is recorded FAILED, but zero lines / payments are posted.
    const imp = await prisma.bankStatementImport.findFirstOrThrow();
    expect(imp.status).toBe("FAILED");
    expect(await prisma.statementLine.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("B13: re-importing the same statement is silently skipped (0 duplicates)", async () => {
    await ingestStatement(fixture("nlb-149.txt"), "upload:149", "MANUAL_UPLOAD", userId);
    const again = await ingestStatement(
      fixture("nlb-149.txt"),
      "upload:149",
      "MANUAL_UPLOAD",
      userId,
    );
    expect(again.status).toBe("DUPLICATE_SKIPPED");
    expect(await prisma.bankStatementImport.count()).toBe(1);
    expect(await prisma.statementLine.count()).toBe(7); // not 14
  });
});

describe("W2 — Meta receipt matching (§4.4)", () => {
  it("T7: matches by referenceNumber only, books the MKD from the statement 1:1, billable via AdAccount", async () => {
    // Map meta-1's account to a client so the ADS expense is billable (B2).
    const client = await prisma.client.create({
      data: { name: "Ads Client", paymentChannel: "INVOICE", taxId: "4032023558371" },
    });
    await prisma.adAccount.create({
      data: { metaAccountId: "500000000000001", name: "Acc 1", clientId: client.id },
    });

    await ingestStatement(fixture("nlb-149.txt"), "upload:149", "MANUAL_UPLOAD", userId);
    const receipt = await ingestReceipt(fixture("meta-1.txt"), "s3://meta-1.pdf", userId);
    expect(receipt.status).toBe("PARSED");

    const expense = await prisma.expense.findFirstOrThrow({ where: { category: "ADS" } });
    // Statement line for FACEBK AAAA111111 is 1.000,00 ден = 100_000 — booked 1:1, NOT the $18.
    expect(expense.amount).toBe(100_000);
    expect(expense.isBillable).toBe(true);
    expect(expense.clientId).toBe(client.id);
    expect(expense.adSpendReceiptId).not.toBeNull();

    const rcpt = await prisma.adSpendReceipt.findFirstOrThrow();
    expect(rcpt.matchStatus).toBe("AUTO_MATCHED");
    const line = await prisma.statementLine.findFirstOrThrow({
      where: { reference: "AAAA111111" },
    });
    expect(line.processed).toBe(true);
  });

  it("a receipt with no AdAccount mapping books a non-billable ADS expense (B2)", async () => {
    await ingestStatement(fixture("nlb-149.txt"), "upload:149", "MANUAL_UPLOAD", userId);
    await ingestReceipt(fixture("meta-1.txt"), "s3://meta-1.pdf", userId);
    const expense = await prisma.expense.findFirstOrThrow({ where: { category: "ADS" } });
    expect(expense.isBillable).toBe(false);
    expect(expense.clientId).toBeNull();
  });

  it("B13/B15: re-ingesting the receipt and re-running matching post nothing new (idempotent)", async () => {
    await ingestStatement(fixture("nlb-149.txt"), "upload:149", "MANUAL_UPLOAD", userId);
    await ingestReceipt(fixture("meta-1.txt"), "s3://meta-1.pdf", userId);

    const dup = await ingestReceipt(fixture("meta-1.txt"), "s3://meta-1.pdf", userId);
    expect(dup.status).toBe("DUPLICATE_SKIPPED");
    const reran = await runMatching(userId);
    expect(reran).toBe(0);
    expect(await prisma.expense.count({ where: { category: "ADS" } })).toBe(1); // not 2
  });

  it("a receipt whose reference has no META_ADS line stays UNMATCHED (no phantom booking)", async () => {
    // meta-1 (AAAA111111) with NO statement ingested → nothing to match against.
    const res = await ingestReceipt(fixture("meta-1.txt"), "s3://meta-1.pdf", userId);
    expect(res.status).toBe("PARSED");
    expect(await prisma.expense.count({ where: { category: "ADS" } })).toBe(0);
    const rcpt = await prisma.adSpendReceipt.findFirstOrThrow();
    expect(rcpt.matchStatus).toBe("UNMATCHED");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { ingestStatement } from "@/lib/workflows/w2";
import { acknowledgeAlert, countOpenAlerts, listAlerts, raiseAlert } from "@/lib/alerts";
import { prisma, resetDb } from "./setup/db";

/**
 * SM-111 — import/worker alerting. A failed integrity gate raises a durable, acknowledgeable alarm;
 * acknowledging it clears the open count.
 */
const FX = "../../../packages/shared/src/parsers/__fixtures__";
const fixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`${FX}/${f}`, import.meta.url)), "utf8");

let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("SM-111 alerting", () => {
  it("a failed integrity gate raises exactly one INTEGRITY_FAILED alert", async () => {
    const tampered = fixture("nlb-146.txt").replace(
      "100.000,00900,0020.000,00119.100,0011",
      "100.000,00900,0099.000,00119.100,0011",
    );
    const res = await ingestStatement(tampered, "upload:146-bad", "MANUAL_UPLOAD", userId);
    expect(res.status).toBe("FAILED");

    const alerts = await prisma.systemAlert.findMany();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("INTEGRITY_FAILED");
    expect(await countOpenAlerts()).toBe(1);
  });

  it("acknowledging an alert clears the open count", async () => {
    await raiseAlert({ type: "IMPORT_FAILED", title: "Тест", detail: "детаљ" });
    expect(await countOpenAlerts()).toBe(1);

    const [row] = await listAlerts();
    await acknowledgeAlert(row!.id, userId);

    expect(await countOpenAlerts()).toBe(0);
    const acked = await listAlerts();
    expect(acked[0]!.acknowledgedAt).not.toBeNull();
  });
});

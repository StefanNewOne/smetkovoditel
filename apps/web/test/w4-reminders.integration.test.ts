import { beforeEach, describe, expect, it } from "vitest";
import { type MailClient, type MailMessage, sendReminders } from "@/lib/workflows/w4-reminders";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createCashClient, createInvoiceClient } from "./setup/factories";

/**
 * W4 reminders (SM-50). Tiers: due+7 / due+21 / OVERDUE due+30, one email per charge per tier,
 * CASH_OBLIGATION never emailed. Transport is a fake collector — no live send.
 */
const PERIOD = "2026-07";
let userId = "";
const NOW = new Date(Date.UTC(2026, 6, 31)); // fixed "today" for deterministic ageing

class FakeMail implements MailClient {
  sent: MailMessage[] = [];
  async send(msg: MailMessage) {
    this.sent.push(msg);
  }
}

/** Create an approved invoice whose dueDate is `age` days before NOW. */
async function approvedInvoiceDue(age: number, opts?: { email?: string | null; name?: string }) {
  const client = await createInvoiceClient({
    userId,
    monthlyAmount: 1_000_000,
    name: opts?.name,
    contactEmail: opts?.email,
  });
  await generateCharges(PERIOD, userId);
  const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
  await approveInvoice(charge.id, userId);
  const dueDate = new Date(NOW.getTime() - age * 86_400_000);
  await prisma.charge.update({ where: { id: charge.id }, data: { dueDate } });
  return charge.id;
}

beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("W4 — reminder tier selection", () => {
  it("sends the due+7 reminder for an 8-day-overdue invoice", async () => {
    await approvedInvoiceDue(8, { email: "a@client.test" });
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.sent).toBe(1);
    expect(res.byTier).toEqual({ R7: 1 });
    expect(mail.sent[0]!.to).toBe("a@client.test");
  });

  it("picks the strongest reached tier (30+ → R30)", async () => {
    await approvedInvoiceDue(35);
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.byTier).toEqual({ R30: 1 });
  });

  it("sends nothing before due+7", async () => {
    await approvedInvoiceDue(3);
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.sent).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("W4 — reminder idempotency & progression", () => {
  it("does not re-send the same tier on a second run", async () => {
    await approvedInvoiceDue(8);
    const mail = new FakeMail();
    await sendReminders(mail, { now: NOW, userId });
    const second = await sendReminders(mail, { now: NOW, userId });
    expect(second.sent).toBe(0);
    expect(mail.sent).toHaveLength(1);
  });

  it("advances to the next tier as the invoice ages further", async () => {
    const id = await approvedInvoiceDue(8);
    const mail = new FakeMail();
    await sendReminders(mail, { now: NOW, userId }); // R7

    // 2 weeks later the same invoice is 22 days overdue → R21.
    const later = new Date(NOW.getTime() + 14 * 86_400_000);
    const res = await sendReminders(mail, { now: later, userId });
    expect(res.byTier).toEqual({ R21: 1 });
    const logs = await prisma.auditLog.findMany({
      where: { entityId: id, action: "reminder.sent" },
    });
    expect(logs).toHaveLength(2); // R7 + R21
  });
});

describe("W4 — reminder exclusions", () => {
  it("skips invoices with no contact email", async () => {
    await approvedInvoiceDue(8, { email: null });
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.sent).toBe(0);
    expect(res.skippedNoEmail).toBe(1);
  });

  it("never emails a CASH_OBLIGATION (internal only)", async () => {
    const cash = await createCashClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: cash.id } });
    await prisma.charge.update({
      where: { id: charge.id },
      data: { dueDate: new Date(NOW.getTime() - 40 * 86_400_000) },
    });
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.sent).toBe(0);
  });

  it("does not remind a fully paid invoice", async () => {
    const id = await approvedInvoiceDue(40);
    await prisma.charge.update({
      where: { id },
      data: { paidAmount: (await prisma.charge.findUniqueOrThrow({ where: { id } })).total },
    });
    const mail = new FakeMail();
    const res = await sendReminders(mail, { now: NOW, userId });
    expect(res.sent).toBe(0);
  });
});

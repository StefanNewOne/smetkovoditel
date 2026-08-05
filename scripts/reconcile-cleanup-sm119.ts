import { prisma } from "@smetko/db";

/**
 * SM-119 one-off cleanup of the confirmed mis-reconciliations (owner-verified). Fully audited.
 *  1. Reset the wrongly-"paid" invoices to OPEN (СОКОЛОВ Jul, ГРИГОС Aug, РЕМИ ПАН Aug).
 *  2. КЦ ГРУП: 1-101 stays paid by its own 4.167.500 line; free the 5.287.600 line (ЛЛ ГУРМЕТ+МаКош
 *     money that landed there), reduce the phantom credit by 5.287.600, and split the freed line to
 *     1-72 (ЛЛ ГУРМЕТ) + 1-79 (МаКош).
 * Idempotent-ish: skips anything already in the target state. Run: tsx scripts/reconcile-cleanup-sm119.ts
 */
async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  const userId = admin?.id ?? "cleanup-sm119";

  async function resetInvoice(invoiceNumber: string) {
    const ch = await prisma.charge.findFirst({ where: { invoiceNumber } });
    if (!ch) return console.log(`  · ${invoiceNumber}: не постои — прескокнато`);
    if (ch.paidAmount === 0 && ch.status === "OPEN")
      return console.log(`  · ${invoiceNumber}: веќе OPEN — прескокнато`);
    await prisma.$transaction(async (tx) => {
      const pays = await tx.payment.findMany({
        where: { chargeId: ch.id },
        select: { id: true, statementLineId: true },
      });
      const lineIds = pays.map((p) => p.statementLineId).filter((x): x is string => !!x);
      if (lineIds.length)
        await tx.statementLine.updateMany({
          where: { id: { in: lineIds } },
          data: { processed: false, linkedType: null, linkedId: null },
        });
      await tx.payment.deleteMany({ where: { chargeId: ch.id } });
      await tx.charge.update({ where: { id: ch.id }, data: { paidAmount: 0, status: "OPEN" } });
      await tx.auditLog.create({
        data: {
          entity: "Charge",
          entityId: ch.id,
          action: "cleanup.reset",
          diff: { invoiceNumber, removedPayments: pays.length, freedLines: lineIds.length },
          userId,
        },
      });
      console.log(
        `  · ${invoiceNumber}: OPEN (тргнати ${pays.length} уплати, ослободени ${lineIds.length} линии)`,
      );
    });
  }

  console.log("1) Ресетирам погрешно платени фактури:");
  await resetInvoice("1-92/2026"); // СОКОЛОВ Јул
  await resetInvoice("1-3/8-2026"); // ГРИГОС Авг (ghost)
  await resetInvoice("1-6/8-2026"); // РЕМИ ПАН Авг (ghost)

  console.log("2) КЦ ГРУП — ослободувам ја туѓата линија + поправам кредит + делам на 1-72/1-79:");
  const line = await prisma.statementLine.findFirst({
    where: { amount: 5_287_600, reference: "1-101/2026", counterpartyAccount: "210-0595166603-23" },
  });
  const inv72 = await prisma.charge.findFirst({ where: { invoiceNumber: "1-72/2026" } });
  const inv79 = await prisma.charge.findFirst({ where: { invoiceNumber: "1-79/2026" } });

  if (!line) console.log("  · линијата 5.287.600 не е најдена — прескокнато");
  else if (!inv72 || !inv79) console.log("  · 1-72/1-79 не се најдени — прескокнато");
  else if (line.processed === false) console.log("  · линијата е веќе ослободена — прескокнато");
  else {
    await prisma.$transaction(async (tx) => {
      // the wrong 0-payment that parked this line on КЦ ГРУП 1-101
      const kcCharge = await tx.charge.findFirst({ where: { invoiceNumber: "1-101/2026" } });
      const wrongPay = await tx.payment.findFirst({ where: { statementLineId: line.id } });
      if (wrongPay) await tx.payment.delete({ where: { id: wrongPay.id } });
      // remove the ЛЛ ГУРМЕТ money (5.287.600) from КЦ ГРУП's phantom credit
      if (kcCharge) {
        const kc = await tx.client.findUnique({ where: { id: kcCharge.clientId } });
        const newCredit = Math.max(0, (kc?.creditBalance ?? 0) - 5_287_600);
        await tx.client.update({
          where: { id: kcCharge.clientId },
          data: { creditBalance: newCredit },
        });
        console.log(`  · КЦ ГРУП кредит: ${kc?.creditBalance} → ${newCredit}`);
      }
      // free the line, then split it to 1-72 + 1-79 (1:1 link on the first)
      await tx.statementLine.update({
        where: { id: line.id },
        data: { processed: true, linkedType: "Charge", linkedId: inv72.id },
      });
      const allocs = [
        { charge: inv72, amount: inv72.total - inv72.paidAmount, first: true },
        { charge: inv79, amount: inv79.total - inv79.paidAmount, first: false },
      ];
      for (const a of allocs) {
        const applied = Math.min(a.amount, Math.max(a.charge.total - a.charge.paidAmount, 0));
        await tx.payment.create({
          data: {
            clientId: a.charge.clientId,
            chargeId: a.charge.id,
            channel: "BANK",
            amount: applied,
            date: line.date,
            reference: line.reference,
            matchStatus: "MANUAL_MATCHED",
            statementLineId: a.first ? line.id : null,
          },
        });
        const newPaid = a.charge.paidAmount + applied;
        await tx.charge.update({
          where: { id: a.charge.id },
          data: {
            paidAmount: newPaid,
            status: newPaid >= a.charge.total ? "PAID" : "PARTIALLY_PAID",
          },
        });
        console.log(
          `  · ${a.charge.invoiceNumber}: +${applied} → ${newPaid >= a.charge.total ? "PAID" : "PARTIALLY_PAID"}`,
        );
      }
      await tx.auditLog.create({
        data: {
          entity: "StatementLine",
          entityId: line.id,
          action: "cleanup.rebook.split",
          diff: { from: "1-101/2026", to: ["1-72/2026", "1-79/2026"], amount: line.amount },
          userId,
        },
      });
    });
  }

  console.log(
    "\nЗабелешка: дуплата 2025-12 фактура за ЛЛ ГУРМЕТ НЕ е дирана — реши рачно (двосмислено).",
  );
  console.log("Готово.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import { NextResponse } from "next/server";
import { prisma } from "@smetko/db";
import { manualMatchStatementLine } from "@/lib/workflows/w2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk manual-match helper for incoming bank payments that carry no (or a wrong) повикување на број
 * and so did not auto-book during import (§4.2). A payment is proposed for a charge ONLY when its
 * amount EXACTLY equals the remaining balance of a SINGLE open charge — an unambiguous amount match.
 * Ambiguous (several charges share that remaining) and no-candidate payments are left untouched for
 * true manual review in the Import center.
 *
 * §4.2 forbids silent auto-matching of client payments (amount coincidence is not proof). So the
 * default is a DRY-RUN report; `apply=1` is the human's deliberate bulk confirmation and applies
 * only the unambiguous proposals via the tested {@link manualMatchStatementLine} (period-guarded
 * B9, overpayment → creditBalance B18). Guarded by CRON_SECRET.
 *
 *   GET /api/cron/match-payments?secret=…[&apply=1]
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const apply = url.searchParams.get("apply") === "1";

  const actor = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!actor) return NextResponse.json({ ok: false, error: "no admin user" }, { status: 500 });

  const payments = await prisma.statementLine.findMany({
    where: { processed: false, direction: "IN" },
    orderBy: { amount: "desc" },
  });
  const open = await prisma.charge.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_PAID"] }, invoiceNumber: { not: null } },
    include: { client: { select: { name: true } } },
  });

  // Index open charges by their REMAINING balance (total − paid), the amount a full payment settles.
  const byRemaining = new Map<number, typeof open>();
  for (const c of open) {
    const rem = c.total - c.paidAmount;
    const list = byRemaining.get(rem) ?? [];
    list.push(c);
    byRemaining.set(rem, list);
  }

  const d0 = (den: number) => (den / 100).toLocaleString("mk-MK");
  const usedChargeIds = new Set<string>();
  const proposals: Array<{
    lineId: string;
    amount: string;
    reference: string | null;
    charge: string;
    client: string;
    status: "proposed" | "applied" | "error";
    detail?: string;
  }> = [];
  let ambiguous = 0;
  let noCandidate = 0;
  let applied = 0;

  for (const p of payments) {
    const candidates = (byRemaining.get(p.amount) ?? []).filter((c) => !usedChargeIds.has(c.id));
    if (candidates.length === 0) {
      noCandidate++;
      continue;
    }
    if (candidates.length > 1) {
      ambiguous++;
      continue;
    }
    const charge = candidates[0]!;
    const row = {
      lineId: p.id,
      amount: d0(p.amount),
      reference: p.reference,
      charge: charge.invoiceNumber!,
      client: charge.client.name,
      status: "proposed" as "proposed" | "applied" | "error",
      detail: undefined as string | undefined,
    };
    if (apply) {
      try {
        await manualMatchStatementLine(p.id, charge.id, actor.id);
        usedChargeIds.add(charge.id); // one charge settles at most one payment per run
        row.status = "applied";
        applied++;
      } catch (e) {
        row.status = "error";
        row.detail = e instanceof Error ? e.message : "unknown";
      }
    } else {
      usedChargeIds.add(charge.id); // avoid proposing the same charge to two equal-amount payments
    }
    proposals.push(row);
  }

  return NextResponse.json({
    ok: true,
    apply,
    totalUnmatchedPayments: payments.length,
    unambiguousProposals: proposals.length,
    applied,
    ambiguous,
    noCandidate,
    proposals,
  });
}

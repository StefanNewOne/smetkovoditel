export const dynamic = "force-dynamic";

import { currentPeriod, isValidPeriod } from "@smetko/shared";
import { prisma } from "@smetko/db";
import {
  getCharges,
  getChargesByClient,
  getClientOptions,
  getUnmatchedPayments,
} from "@/lib/charges";
import { getCloseBlockers } from "@/lib/workflows/w8";
import { ChargesView } from "./charges-view";

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; client?: string }>;
}) {
  const { period: raw, client } = await searchParams;
  const period = raw && isValidPeriod(raw) ? raw : currentPeriod();
  const year = period.slice(0, 4);

  const [clients, blockers, periodRow, unmatchedPayments] = await Promise.all([
    getClientOptions(),
    getCloseBlockers(period),
    prisma.period.findUnique({ where: { id: period } }),
    getUnmatchedPayments(),
  ]);

  const clientId = client && clients.some((c) => c.id === client) ? client : undefined;
  const charges = clientId ? await getChargesByClient(clientId, year) : await getCharges(period);

  return (
    <ChargesView
      period={period}
      year={year}
      charges={charges}
      clients={clients}
      clientId={clientId}
      clientName={clients.find((c) => c.id === clientId)?.name}
      blockers={blockers}
      closed={periodRow?.status === "CLOSED"}
      unmatchedPayments={unmatchedPayments}
    />
  );
}

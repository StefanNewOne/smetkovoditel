export const dynamic = "force-dynamic";

import { currentPeriod, isValidPeriod } from "@smetko/shared";
import { prisma } from "@smetko/db";
import { getCharges } from "@/lib/charges";
import { getCloseBlockers } from "@/lib/workflows/w8";
import { ChargesView } from "./charges-view";

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period = raw && isValidPeriod(raw) ? raw : currentPeriod();
  const [charges, blockers, periodRow] = await Promise.all([
    getCharges(period),
    getCloseBlockers(period),
    prisma.period.findUnique({ where: { id: period } }),
  ]);
  const draftCount = charges.filter((c) => c.status === "DRAFT").length;

  return (
    <ChargesView
      period={period}
      charges={charges}
      draftCount={draftCount}
      blockers={blockers}
      closed={periodRow?.status === "CLOSED"}
    />
  );
}

import { currentPeriod, isValidPeriod } from "@smetko/shared";
import { getCharges } from "@/lib/charges";
import { ChargesView } from "./charges-view";

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period = raw && isValidPeriod(raw) ? raw : currentPeriod();
  const charges = await getCharges(period);
  const draftCount = charges.filter((c) => c.status === "DRAFT").length;

  return <ChargesView period={period} charges={charges} draftCount={draftCount} />;
}

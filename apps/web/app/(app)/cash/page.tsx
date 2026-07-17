export const dynamic = "force-dynamic";

import { currentPeriod } from "@smetko/shared";
import { getCashLedger, getCollectionData } from "@/lib/cash";
import { CashView } from "./cash-view";

export default async function CashPage() {
  const period = currentPeriod();
  const [ledger, clients] = await Promise.all([getCashLedger(period), getCollectionData()]);

  return <CashView period={period} ledger={ledger} clients={clients} />;
}

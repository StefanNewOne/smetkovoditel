export const dynamic = "force-dynamic";

import { getContractorsData } from "@/lib/contractors";
import { ContractorsView } from "./contractors-view";

export default async function ContractorsPage() {
  const { contractors, clients } = await getContractorsData();
  return <ContractorsView contractors={contractors} clients={clients} />;
}

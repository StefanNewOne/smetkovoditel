export const dynamic = "force-dynamic";

import { getResolveCenter } from "@/lib/resolve";
import { ResolveView } from "./resolve-view";

export default async function ResolvePage() {
  const { payments, expenses, clients, openCharges, categories, lenders } =
    await getResolveCenter();
  return (
    <ResolveView
      payments={payments}
      expenses={expenses}
      clients={clients}
      openCharges={openCharges}
      categories={categories}
      lenders={lenders}
    />
  );
}

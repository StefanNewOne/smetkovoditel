export const dynamic = "force-dynamic";

import { getResolveCenter } from "@/lib/resolve";
import { ResolveView } from "./resolve-view";

export default async function ResolvePage() {
  const { payments, expenseGroups, clients, openCharges, categories, lenders } =
    await getResolveCenter();
  return (
    <ResolveView
      payments={payments}
      expenseGroups={expenseGroups}
      clients={clients}
      openCharges={openCharges}
      categories={categories}
      lenders={lenders}
    />
  );
}

export const dynamic = "force-dynamic";

import { getExpenseCategoryOptions } from "@/lib/expenses";
import { getSettingsData } from "@/lib/settings";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const [{ period, employees, runs, config, vendorRules }, categories] = await Promise.all([
    getSettingsData(),
    getExpenseCategoryOptions(),
  ]);
  return (
    <SettingsView
      period={period}
      employees={employees}
      runs={runs}
      config={config}
      vendorRules={vendorRules}
      categories={categories}
    />
  );
}

export const dynamic = "force-dynamic";

import { EXPENSE_CATEGORIES } from "@/lib/resolve";
import { getSettingsData } from "@/lib/settings";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const { period, employees, runs, config, vendorRules } = await getSettingsData();
  return (
    <SettingsView
      period={period}
      employees={employees}
      runs={runs}
      config={config}
      vendorRules={vendorRules}
      categories={EXPENSE_CATEGORIES}
    />
  );
}

export const dynamic = "force-dynamic";

import { getSettingsData } from "@/lib/settings";
import { SettingsView } from "./settings-view";

export default async function SettingsPage() {
  const { period, employees, runs, config, vendorRules, categories } = await getSettingsData();
  return (
    <SettingsView
      period={period}
      employees={employees}
      runs={runs}
      config={config}
      vendorRules={vendorRules}
      catAdmin={categories}
    />
  );
}

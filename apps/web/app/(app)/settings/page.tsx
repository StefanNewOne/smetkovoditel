export const dynamic = "force-dynamic";

import { getSettingsData } from "@/lib/settings";
import { getCompanyProfile } from "@/lib/company";
import { SettingsView } from "./settings-view";
import { CompanyProfileCard } from "./company-profile-card";

export default async function SettingsPage() {
  const [{ period, employees, runs, config, vendorRules, categories }, company] = await Promise.all(
    [getSettingsData(), getCompanyProfile()],
  );
  return (
    <div className="flex flex-col gap-4">
      <CompanyProfileCard profile={company} />
      <SettingsView
        period={period}
        employees={employees}
        runs={runs}
        config={config}
        vendorRules={vendorRules}
        catAdmin={categories}
      />
    </div>
  );
}

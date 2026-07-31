export const dynamic = "force-dynamic";

import { listAlerts } from "@/lib/alerts";
import { AlertsView } from "./alerts-view";

export default async function AlertsPage() {
  const alerts = await listAlerts();
  return <AlertsView alerts={alerts} />;
}

export const dynamic = "force-dynamic";

import { getImportCenter } from "@/lib/import";
import { ImportView } from "./import-view";

export default async function ImportPage() {
  const { statements, queues, openCharges } = await getImportCenter();
  return <ImportView statements={statements} queues={queues} openCharges={openCharges} />;
}

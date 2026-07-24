export const dynamic = "force-dynamic";

import { getImportCenter } from "@/lib/import";
import { ImportView } from "./import-view";

export default async function ImportPage() {
  const { statements, metaReceipts, queues } = await getImportCenter();
  return <ImportView statements={statements} metaReceipts={metaReceipts} queues={queues} />;
}

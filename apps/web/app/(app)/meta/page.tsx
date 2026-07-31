export const dynamic = "force-dynamic";

import { getMetaOverview } from "@/lib/meta";
import { MetaView } from "./meta-view";

export default async function MetaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const data = await getMetaOverview(from, to);
  return <MetaView {...data} from={from ?? ""} to={to ?? ""} />;
}

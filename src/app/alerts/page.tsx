import { buildBriefing } from "@/lib/pipeline/briefing";
import { AlertsClient } from "@/components/AlertsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AlertsPage() {
  const b = await buildBriefing(720);
  return <AlertsClient items={[...b.items, ...b.routine]} holdings={b.holdings} mode={b.mode} />;
}

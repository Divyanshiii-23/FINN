import { dataMode, SNAPSHOT_CAPTURED_AT } from "@/lib/sources";
import { llmStatus, usage } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, dataMode: dataMode(), snapshotCapturedAt: SNAPSHOT_CAPTURED_AT, llm: llmStatus(), llmUsage: usage, time: new Date().toISOString() });
}

import { buildBriefing } from "@/lib/pipeline/briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const w = Number(new URL(req.url).searchParams.get("window") ?? 24);
  const hours = [24, 72, 168, 720].includes(w) ? w : 24;
  try {
    return Response.json(await buildBriefing(hours), { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } });
  } catch (e) {
    console.error("[briefing]", e);
    return Response.json({ error: "Briefing failed to build", detail: (e as Error).message }, { status: 500 });
  }
}

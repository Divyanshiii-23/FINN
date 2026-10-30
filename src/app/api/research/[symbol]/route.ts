import { buildReport } from "@/lib/research/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!/^[A-Za-z0-9&\-]{1,20}$/.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });
  try {
    const r = await buildReport(symbol);
    if (!r) return Response.json({ error: `No fundamentals found for ${symbol.toUpperCase()} — check the NSE symbol.` }, { status: 404 });
    return Response.json(r);
  } catch (e) {
    console.error("[research]", symbol, e);
    return Response.json({ error: "Research failed", detail: (e as Error).message }, { status: 500 });
  }
}

import { snapshotSymbols, dataMode } from "@/lib/sources";
import { screenerSearch } from "@/lib/sources/screener";
import snapshot from "../../../../data/snapshot/companies.json";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ results: [] });
  const local = snapshotSymbols()
    .map((s) => ({ symbol: s, name: (snapshot as { companies: Record<string, { name: string }> }).companies[s].name, local: true }))
    .filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()));
  let remote: { symbol: string; name: string; local: boolean }[] = [];
  if (dataMode() !== "snapshot") {
    try { remote = (await screenerSearch(q)).map((r) => ({ ...r, local: false })).filter((r) => !local.some((l) => l.symbol === r.symbol)); } catch { /* offline */ }
  }
  return Response.json({ results: [...local, ...remote].slice(0, 8) });
}

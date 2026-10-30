import { getCompany } from "@/lib/sources";
import { processCompany } from "@/lib/pipeline/briefing";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!/^[A-Za-z0-9&\-]{1,20}$/.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });
  const { company, report } = await getCompany(symbol);
  if (!company) return Response.json({ error: `No data found for ${symbol.toUpperCase()}`, sources: report.failures }, { status: 404 });
  return Response.json({ company, feed: processCompany(company), sourceFailures: report.failures });
}

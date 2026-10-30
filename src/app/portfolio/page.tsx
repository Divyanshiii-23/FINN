import Link from "next/link";
import { buildBriefing } from "@/lib/pipeline/briefing";
import { Delta, Pct, ProvenanceChip, Sparkline, TierBadge } from "@/components/ui";
import { fmtPrice } from "@/lib/format";
import { fiscalLabel } from "@/lib/finance/quarters";
import type { Tier } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RANK: Record<Tier, number> = { high: 0, medium: 1, low: 2, routine: 3 };

export default async function PortfolioPage() {
  const b = await buildBriefing(168);
  const holdings = [...b.holdings].sort((a, z) => (RANK[a.topTier ?? "routine"] - RANK[z.topTier ?? "routine"]) || z.openItems - a.openItems || a.symbol.localeCompare(z.symbol));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Mock portfolio · equal-weighted</div>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight sm:text-[28px]">Holdings</h1>
          <p className="mt-1 max-w-xl text-[13px] text-muted">Sorted by what needs attention this week, then by activity. Latest-quarter growth is computed from reported results; margin trend is the last eight quarters.</p>
        </div>
        <div className="flex gap-1.5">{b.sources.slice(1).map((s, i) => <ProvenanceChip key={i} p={s} compact label={["Prices", "Financials"][i]} />)}</div>
      </div>

      {/* desktop table */}
      <div className="mt-6 hidden overflow-hidden rounded-lg border hairline md:block">
        <table className="w-full text-[13px]">
          <thead className="bg-panel2 text-left text-[10.5px] uppercase tracking-[0.08em] text-faint">
            <tr>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 text-right font-medium">Price</th>
              <th className="px-3 py-2.5 text-right font-medium">Day</th>
              <th className="px-3 py-2.5 font-medium">Latest Q</th>
              <th className="px-3 py-2.5 text-right font-medium">Rev YoY</th>
              <th className="px-3 py-2.5 text-right font-medium">PAT YoY</th>
              <th className="px-3 py-2.5 font-medium">Margin, 8Q</th>
              <th className="px-3 py-2.5 font-medium">This week</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-panel">
            {holdings.map((h) => (
              <tr key={h.symbol} className="hover:bg-panel2/60">
                <td className="px-3 py-2.5">
                  <Link href={`/company/${h.symbol}`} className="group block">
                    <span className="num text-ink group-hover:text-accent">{h.symbol}</span>
                    <span className="ml-2 text-muted">{h.name}</span>
                    <div className="text-[11.5px] text-faint">{h.sector}</div>
                  </Link>
                </td>
                <td className="num px-3 py-2.5 text-right text-ink">{fmtPrice(h.price?.value)}<div className="text-[10.5px] text-faint">{h.price?.kind === "intraday" ? "intraday" : h.price?.date ?? ""}</div></td>
                <td className="px-3 py-2.5 text-right"><Pct v={h.price?.changePct ?? null} /></td>
                <td className="num px-3 py-2.5 text-muted">{h.latestQuarter ? fiscalLabel(h.latestQuarter) : "—"}</td>
                <td className="px-3 py-2.5 text-right"><Delta c={h.revenueYoY} /></td>
                <td className="px-3 py-2.5 text-right"><Delta c={h.patYoY} /></td>
                <td className="px-3 py-2.5"><Sparkline values={h.marginTrend} width={96} /></td>
                <td className="px-3 py-2.5">{h.topTier ? <span className="inline-flex items-center gap-2"><TierBadge tier={h.topTier} /><span className="text-[12px] text-muted">{h.openItems}</span></span> : <span className="text-faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* mobile list */}
      <ul className="mt-5 space-y-2 md:hidden">
        {holdings.map((h) => (
          <li key={h.symbol}>
            <Link href={`/company/${h.symbol}`} className="block rounded-lg border hairline bg-panel px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className="num text-[14px] text-ink">{h.symbol}</span>
                {h.topTier && <TierBadge tier={h.topTier} />}
                <span className="ml-auto num text-[14px] text-ink">{fmtPrice(h.price?.value)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
                <span className="truncate">{h.name}</span>
                <span className="ml-auto"><Pct v={h.price?.changePct ?? null} /></span>
              </div>
              <div className="mt-2.5 flex items-center gap-4 border-t hairline pt-2.5 text-[11.5px]">
                <span className="text-faint">{h.latestQuarter ? fiscalLabel(h.latestQuarter) : "—"}</span>
                <span className="text-faint">Rev <Delta c={h.revenueYoY} size="xs" /></span>
                <span className="text-faint">PAT <Delta c={h.patYoY} size="xs" /></span>
                <span className="ml-auto"><Sparkline values={h.marginTrend} width={64} height={18} /></span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] text-faint">Day move is the last quote on file ({b.mode === "snapshot" ? "screener.in quote captured 30 Oct; some intraday" : "Yahoo EOD"}). Margin = EBITDA margin for companies; PAT/revenue for lenders.</p>
    </div>
  );
}

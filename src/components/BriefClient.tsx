"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { Briefing, FeedItem } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { FeedCard } from "./FeedCard";
import { Empty, Pct, SectionTitle, Sparkline } from "./ui";
import { marketFromHoldings, matchesRules, useRules } from "@/lib/rules-client";
import { fmtDate } from "@/lib/format";

export function BriefClient({ briefing: b, hours }: { briefing: Briefing; hours: number }) {
  const [rules] = useRules();
  const market = useMemo(() => marketFromHoldings(b.holdings, rules), [b.holdings, rules]);
  const high = b.items.filter((i) => i.tier === "high");
  const med = b.items.filter((i) => i.tier === "medium");
  const low = b.items.filter((i) => i.tier === "low");
  const wider = b.windowCounts.find((c) => c.hours === 168);
  const reported = b.items.filter((i) => i.category === "results" && i.results && !("pending" in i.results)).length;
  const moves = b.holdings.map((h) => h.price?.changePct).filter((x): x is number => x != null);
  const ew = moves.length ? moves.reduce((s, x) => s + x, 0) / moves.length : null;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-8">
        <section aria-label="Digest">
          <div className="eyebrow mb-2">The read</div>
          <div className="space-y-2 font-serif text-[16.5px] leading-[1.6] text-ink/95 sm:text-[17px]">
            {b.digest.map((s, i) => <p key={i} className={i === 0 ? "" : "text-ink/75"}>{s}</p>)}
          </div>
          <div className="mt-2 text-[11px] text-faint">Written by FINN&apos;s rules from the scored items below — no language model in this paragraph.</div>
        </section>

        {hours === 24 && !high.length && wider && wider.high > 0 && (
          <Link href="/?w=168" className="flex items-center justify-between rounded-md border hairline bg-panel px-3.5 py-2.5 text-[13px] text-muted hover:text-ink">
            <span>Quiet 24 hours. The 7-day window has <span className="text-high">{wider.high} high-priority</span> item{wider.high > 1 ? "s" : ""}.</span>
            <span className="text-faint">View →</span>
          </Link>
        )}

        <Group title="Needs attention" eyebrow={`${high.length} high priority`} items={high} openFirst rules={rules} empty="Nothing cleared the high-priority bar in this window." />
        <Group title="Worth a look" eyebrow={`${med.length} to review`} items={med} rules={rules} />
        {low.length > 0 && <Group title="Noted" eyebrow={`${low.length} lower priority`} items={low} rules={rules} />}

        {b.routine.length > 0 && (
          <section>
            <details className="rounded-lg border hairline bg-panel">
              <summary className="flex items-center justify-between px-4 py-3 text-[13px] text-muted">
                <span><span className="chev mr-2">›</span>{b.routine.length} routine filings hidden</span>
                <span className="text-faint">ESOPs · certificates · notices</span>
              </summary>
              <ul className="divide-y divide-line border-t hairline">
                {b.routine.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-3 px-4 py-2 text-[12.5px]">
                    <span className="num w-20 shrink-0 text-ink/80">{r.symbol}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-muted hover:text-ink">{r.title}</a>
                    <span className="num shrink-0 text-faint">{fmtDate(r.date)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}

        {b.warnings.length > 0 && b.mode !== "snapshot" && (
          <div className="text-[11.5px] text-faint">Source notes: {b.warnings.join(" · ")}</div>
        )}
      </div>

      <aside className="space-y-8">
        <section>
          <SectionTitle eyebrow="EOD triggers" title="Market moves" right={<Link href="/alerts" className="text-[12px] text-muted hover:text-ink">±{rules.priceMovePct}% · {rules.volumeMultiple}× vol</Link>} />
          {market.length ? (
            <ul className="divide-y divide-line rounded-lg border hairline bg-panel">
              {market.map((m) => {
                const h = b.holdings.find((x) => x.symbol === m.symbol);
                return (
                  <li key={m.symbol + m.kind} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/company/${m.symbol}`} className="num text-[13px] text-ink hover:text-accent">{m.symbol}</Link>
                      <div className="truncate text-[11.5px] text-muted">{m.text}</div>
                    </div>
                    {h?.price?.history && <Sparkline values={h.price.history.map((x) => x.close)} />}
                    <div className="w-16 text-right text-[13px]">{m.kind === "price" ? <Pct v={m.value} /> : <span className="num text-accent">{m.value.toFixed(1)}×</span>}</div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty title="No moves beyond your thresholds" />}
          {b.mode === "snapshot" && <p className="mt-2 text-[11px] leading-relaxed text-faint">Snapshot prices are the last quote shown on screener.in (some intraday). Volume-vs-average needs the live Yahoo EOD feed.</p>}
        </section>

        <section>
          <SectionTitle eyebrow="From intimations" title="Coming up" />
          {b.upcoming.length ? (
            <ul className="divide-y divide-line rounded-lg border hairline bg-panel">
              {b.upcoming.slice(0, 8).map((u) => (
                <li key={u.symbol + u.date + u.label} className="flex items-baseline gap-3 px-3.5 py-2.5 text-[12.5px]">
                  <span className="num w-14 shrink-0 text-ink/90">{fmtDate(u.date)}</span>
                  <a href={u.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-muted hover:text-ink"><span className="text-ink/90">{u.company}</span> · {u.label}</a>
                </li>
              ))}
            </ul>
          ) : <Empty title="No dated events in the next three weeks" />}
        </section>

        <section>
          <SectionTitle eyebrow="Equal-weighted" title="Portfolio pulse" right={<Link href="/portfolio" className="text-[12px] text-muted hover:text-ink">All holdings →</Link>} />
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border hairline bg-line text-center">
            <Stat label="Day move" value={<Pct v={ew} />} />
            <Stat label="Filings" value={<span className="num">{b.stats.filings}</span>} sub={`${b.stats.hidden} hidden`} />
            <Stat label="Reported" value={<span className="num">{reported}</span>} sub="results" />
          </div>
          <ul className="mt-3 space-y-1.5">
            {b.holdings.filter((h) => h.openItems > 0).slice(0, 6).map((h) => (
              <li key={h.symbol} className="flex items-center justify-between text-[12.5px]">
                <Link href={`/company/${h.symbol}`} className="num text-ink/90 hover:text-accent">{h.symbol}</Link>
                <span className="text-muted">{h.openItems} item{h.openItems > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Group({ title, eyebrow, items, openFirst, rules, empty }: { title: string; eyebrow: string; items: FeedItem[]; openFirst?: boolean; rules: ReturnType<typeof useRules>[0]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section>
      <SectionTitle eyebrow={eyebrow} title={title} />
      {items.length ? (
        <div className="space-y-2.5">
          {items.map((i, k) => <FeedCard key={i.id} item={i} defaultOpen={!!openFirst && k === 0} alerting={matchesRules(i, rules)} />)}
        </div>
      ) : <Empty title={empty!} />}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-panel px-2 py-3">
      <div className="eyebrow !text-[9.5px]">{label}</div>
      <div className="mt-1 text-[16px]">{value}</div>
      {sub && <div className="text-[10.5px] text-faint">{sub}</div>}
    </div>
  );
}

export { CATEGORY_LABEL };

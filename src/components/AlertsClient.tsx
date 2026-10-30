"use client";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { CATEGORIES, CATEGORY_LABEL, type Category, type FeedItem, type Holding } from "@/lib/types";
import { DEFAULT_RULES } from "@/lib/finance/anomaly";
import { marketFromHoldings, matchesRules, useLastSeen, useNotificationPermission, useRules } from "@/lib/rules-client";
import { Empty, Pct, SectionTitle, TierBadge } from "./ui";
import { fmtDate } from "@/lib/format";

export function AlertsClient({ items, holdings, mode }: { items: FeedItem[]; holdings: Holding[]; mode: string }) {
  const [rules, save, loaded] = useRules();
  const [lastSeen, markSeen] = useLastSeen();
  const [perm, requestPerm] = useNotificationPermission();

  const triggered = useMemo(() => items.filter((i) => matchesRules(i, rules)).sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score), [items, rules]);
  const market = useMemo(() => marketFromHoldings(holdings, rules), [holdings, rules]);
  const isNew = (i: FeedItem) => !!lastSeen && i.date > lastSeen.slice(0, 10);
  const fresh = triggered.filter(isNew);

  // Notify once per visit for matches newer than the last visit; mark the visit seen when leaving the page.
  useEffect(() => {
    if (!loaded) return;
    if (perm === "granted" && fresh.length) new Notification(`FINN · ${fresh.length} new alert${fresh.length > 1 ? "s" : ""}`, { body: fresh.slice(0, 3).map((i) => `${i.symbol}: ${i.headline}`).join("\n") });
    return () => markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const toggleCat = (c: Category) => save({ ...rules, categories: rules.categories.includes(c) ? rules.categories.filter((x) => x !== c) : [...rules.categories, c] });
  const toggleSym = (s: string) => save({ ...rules, symbols: rules.symbols.includes(s) ? rules.symbols.filter((x) => x !== s) : [...rules.symbols, s] });

  return (
    <div className="grid gap-10 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div>
        <div className="eyebrow">Push · triggers</div>
        <h1 className="mt-1 text-[24px] font-medium tracking-tight">Alert rules</h1>
        <p className="mt-1 text-[13px] text-muted">You decide what &ldquo;unusual&rdquo; means. Rules are saved in this browser and applied across the app.</p>

        <div className="mt-5 space-y-5 rounded-lg border hairline bg-panel p-4">
          <Slider label="Daily price move" value={rules.priceMovePct} min={1} max={10} step={0.5} fmt={(v) => `±${v}%`} onChange={(v) => save({ ...rules, priceMovePct: v })} />
          <Slider label="Volume vs trailing average" value={rules.volumeMultiple} min={1.25} max={5} step={0.25} fmt={(v) => `${v}×`} onChange={(v) => save({ ...rules, volumeMultiple: v })} />
          <Slider label="Average window" value={rules.volumeLookback} min={5} max={60} step={5} fmt={(v) => `${v} days`} onChange={(v) => save({ ...rules, volumeLookback: v })} />
          <Slider label="Minimum materiality" value={rules.minScore} min={10} max={95} step={5} fmt={(v) => `${v}/100`} onChange={(v) => save({ ...rules, minScore: v })} />

          <div>
            <div className="mb-2 text-[12.5px] text-ink">Announcement types</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.filter((c) => c !== "unclassified").map((c) => (
                <button key={c} onClick={() => toggleCat(c)} aria-pressed={rules.categories.includes(c)}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] ${rules.categories.includes(c) ? "border-accent/50 bg-accent/10 text-ink" : "border-line2 text-faint hover:text-muted"}`}>{CATEGORY_LABEL[c]}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between text-[12.5px] text-ink">Companies <span className="text-[11px] text-faint">{rules.symbols.length ? `${rules.symbols.length} selected` : "all holdings"}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {holdings.map((h) => (
                <button key={h.symbol} onClick={() => toggleSym(h.symbol)} aria-pressed={rules.symbols.includes(h.symbol)}
                  className={`num rounded border px-2 py-0.5 text-[11px] ${rules.symbols.includes(h.symbol) ? "border-accent/50 bg-accent/10 text-ink" : "border-line2 text-faint hover:text-muted"}`}>{h.symbol}</button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t hairline pt-4">
            <button onClick={() => save(DEFAULT_RULES)} className="rounded-md border border-line2 px-3 py-1.5 text-[12.5px] text-muted hover:text-ink">Reset to defaults</button>
            {perm === "default" && <button onClick={requestPerm} className="rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-medium text-bg">Enable browser notifications</button>}
            {perm === "granted" && <span className="text-[12px] text-pos">Notifications on — new matches notify on open</span>}
            {perm === "denied" && <span className="text-[12px] text-faint">Notifications blocked in browser settings</span>}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-8">
        <section>
          <SectionTitle eyebrow={`${triggered.length} match${triggered.length === 1 ? "" : "es"} · last 30 days${fresh.length ? ` · ${fresh.length} new` : ""}`} title="Triggered by filings" />
          {triggered.length ? (
            <ul className="divide-y divide-line rounded-lg border hairline bg-panel">
              {triggered.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-3.5 py-3">
                  <div className="pt-0.5"><TierBadge tier={i.tier} score={i.score} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-[11.5px] text-muted">
                      <Link href={`/company/${i.symbol}`} className="num text-ink/90 hover:text-accent">{i.symbol}</Link>
                      <span>{CATEGORY_LABEL[i.category]}</span>
                      {isNew(i) && <span className="rounded bg-accent/15 px-1 text-[10px] uppercase tracking-wider text-accent">New</span>}
                      <span className="ml-auto num text-faint">{fmtDate(i.date)}</span>
                    </div>
                    <div className="mt-0.5 text-[13.5px] text-ink">{i.headline}</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">{i.reasons.filter((r) => r.basis !== "rule" && r.delta !== 0).slice(0, 3).map((r) => r.text).join(" · ") || i.whyItMatters?.split(". ")[0]}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing matches these rules">Lower the materiality bar or add announcement types.</Empty>}
        </section>

        <section>
          <SectionTitle eyebrow="End-of-day data" title="Triggered by price & volume" />
          {market.length ? (
            <ul className="divide-y divide-line rounded-lg border hairline bg-panel">
              {market.map((m) => (
                <li key={m.symbol + m.kind} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <Link href={`/company/${m.symbol}`} className="num w-24 text-ink hover:text-accent">{m.symbol}</Link>
                  <span className="flex-1 text-muted">{m.text}</span>
                  {m.kind === "price" ? <Pct v={m.value} /> : <span className="num text-accent">{m.value.toFixed(1)}×</span>}
                </li>
              ))}
            </ul>
          ) : <Empty title="No price or volume moves beyond your thresholds" />}
          {mode === "snapshot" && <p className="mt-2 text-[11.5px] text-faint">Snapshot mode carries one quote per stock (no history), so volume alerts activate with the live Yahoo EOD feed.</p>}
        </section>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]"><span className="text-ink">{label}</span><span className="num text-accent">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
    </label>
  );
}

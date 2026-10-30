import Link from "next/link";
import type { FeedItem, ResultsTable } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { Delta, KindChip, SourceLink, TierBadge } from "./ui";
import { fmtBps, fmtCr, fmtDate, fmtPct } from "@/lib/format";
import { fiscalLabel } from "@/lib/finance/quarters";

export function FeedCard({ item, defaultOpen = false, alerting = false }: { item: FeedItem; defaultOpen?: boolean; alerting?: boolean }) {
  const r = item.results;
  const table = r && !("pending" in r) ? (r as ResultsTable) : null;
  const accent = item.tier === "high" ? "before:bg-high" : item.tier === "medium" ? "before:bg-med" : "before:bg-line2";
  return (
    <article className={`rise relative overflow-hidden rounded-lg border hairline bg-panel before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${accent}`}>
      <details open={defaultOpen} className="group">
        <summary className="block px-4 pb-3 pt-3.5 pl-5">
          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <TierBadge tier={item.tier} score={item.score} />
            <Link href={`/company/${item.symbol}`} className="num font-medium text-ink/90 hover:text-accent">{item.symbol}</Link>
            <span className="text-faint">·</span>
            <span>{CATEGORY_LABEL[item.category]}</span>
            <span className="ml-auto num text-faint">{fmtDate(item.date)}{item.time ? ` ${item.time}` : ""}</span>
            {alerting && <span title="Matches your alert rules" className="text-accent">●</span>}
          </div>
          <div className="mt-1.5 flex items-start gap-2">
            <h3 className="flex-1 text-[15.5px] font-medium leading-snug tracking-tight text-ink">{item.headline}</h3>
            <span className="chev mt-1 text-faint">›</span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">{item.company}</div>
          {table && <ResultsStrip t={table} />}
        </summary>

        <div className="space-y-4 border-t hairline px-4 pb-4 pl-5 pt-3.5">
          {item.whyItMatters && (
            <div className="flex gap-2.5">
              <KindChip kind={item.interpretation === "llm" ? "ai" : "calc"} />
              <p className="text-[13.5px] leading-relaxed text-ink/90">{item.whyItMatters}</p>
            </div>
          )}
          {item.management?.profile && <ManagementBlock item={item} />}
          {table && <ResultsTableView t={table} />}
          {r && "pending" in r && (
            <div className="rounded-md border border-dashed border-line2 px-3 py-2.5 text-[12.5px] text-muted">
              {r.claim && <div className="mb-1 flex gap-2"><KindChip kind="mgmt" /><span className="text-ink/90">{r.claim}</span></div>}
              {r.note}
            </div>
          )}
          {item.watch && <p className="text-[12.5px] text-muted"><span className="text-faint">Next · </span>{item.watch}</p>}

          <div>
            <div className="eyebrow mb-1.5">Why it ranks here</div>
            <ul className="space-y-1">
              {item.reasons.map((rs, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[12.5px]">
                  <span className={`num w-9 shrink-0 text-right ${rs.delta > 0 ? "text-ink/80" : rs.delta < 0 ? "text-pos" : "text-faint"}`}>{rs.delta > 0 ? `+${rs.delta}` : rs.delta === 0 ? "·" : `−${Math.abs(rs.delta)}`}</span>
                  <span className="text-muted">{rs.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="eyebrow">Filing{item.related.length ? `s (${item.related.length + 1})` : ""}</div>
            <SourceLink href={item.url} detail={fmtDate(item.date)}>{item.title}</SourceLink>
            {item.related.map((rel) => <SourceLink key={rel.url} href={rel.url} detail={`${CATEGORY_LABEL[rel.category]} · ${fmtDate(rel.date)}`}>{rel.title}</SourceLink>)}
          </div>
        </div>
      </details>
    </article>
  );
}

function ResultsStrip({ t }: { t: ResultsTable }) {
  const rows = t.rows.filter((r) => !r.notMeaningful && r.metric !== "NII");
  return (
    <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden rounded-md border hairline bg-line">
      {rows.map((r) => (
        <div key={r.metric} className="bg-panel2 px-2.5 py-2">
          <div className="eyebrow !text-[9.5px]">{r.label}</div>
          <div className="num mt-0.5 text-[13px] text-ink">{fmtCr(r.current)}</div>
          <div className="mt-0.5 flex gap-1.5 text-[10.5px]"><span className="text-faint">YoY</span><Delta c={r.yoyChange} size="xs" /></div>
        </div>
      ))}
    </div>
  );
}

export function ResultsTableView({ t }: { t: ResultsTable }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="eyebrow">Results first cut · {fiscalLabel(t.quarter)}</div>
        <KindChip kind="calc" />
      </div>
      <div className="overflow-x-auto rounded-md border hairline">
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead className="bg-panel2 text-left text-[10.5px] uppercase tracking-[0.08em] text-faint">
            <tr>
              <th className="px-2.5 py-2 font-medium">₹ crore</th>
              <th className="px-2.5 py-2 text-right font-medium">{t.quarter}</th>
              <th className="px-2.5 py-2 text-right font-medium">{t.prevQuarter ?? "Prev Q"}</th>
              <th className="px-2.5 py-2 text-right font-medium">QoQ</th>
              <th className="px-2.5 py-2 text-right font-medium">{t.yoyQuarter ?? "Year-ago Q"}</th>
              <th className="px-2.5 py-2 text-right font-medium">YoY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {t.rows.map((r) => (
              <tr key={r.metric} title={r.definition}>
                <td className="px-2.5 py-2 text-ink/90">{r.label}</td>
                {r.notMeaningful ? (
                  <td colSpan={5} className="px-2.5 py-2 text-right text-[11.5px] text-faint">n.m. — {r.notMeaningful}</td>
                ) : (
                  <>
                    <td className="num px-2.5 py-2 text-right text-ink">{fmtCr(r.current)}</td>
                    <td className="num px-2.5 py-2 text-right text-muted">{fmtCr(r.prev)}</td>
                    <td className="px-2.5 py-2 text-right"><Delta c={r.qoq} /></td>
                    <td className="num px-2.5 py-2 text-right text-muted">{fmtCr(r.yoy)}</td>
                    <td className="px-2.5 py-2 text-right"><Delta c={r.yoyChange} /></td>
                  </>
                )}
              </tr>
            ))}
            {t.margin && (
              <tr className="bg-panel2/50">
                <td className="px-2.5 py-2 text-muted">{t.margin.label}</td>
                <td className="num px-2.5 py-2 text-right text-ink">{fmtPct(t.margin.current)}</td>
                <td className="num px-2.5 py-2 text-right text-muted">{fmtPct(t.margin.prev)}</td>
                <td className={`num px-2.5 py-2 text-right ${(t.margin.qoqBps ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{fmtBps(t.margin.qoqBps)}</td>
                <td className="num px-2.5 py-2 text-right text-muted">{fmtPct(t.margin.yoy)}</td>
                <td className={`num px-2.5 py-2 text-right ${(t.margin.yoyBps ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{fmtBps(t.margin.yoyBps)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        {t.basis}. EBITDA = revenue − operating expenses (before other income). Changes on a negative base are described, not given a %.
      </p>
    </div>
  );
}

function ManagementBlock({ item }: { item: FeedItem }) {
  const m = item.management!;
  const p = m.profile!;
  return (
    <div className="rounded-md border hairline bg-panel2 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-line2 font-mono text-[11px] text-muted">{m.incoming?.split(" ").map((s) => s[0]).join("").slice(0, 2)}</div>
        <div>
          <div className="text-[13.5px] font-medium text-ink">{m.incoming} <span className="font-normal text-muted">· incoming {m.role}</span></div>
          {m.effective && <div className="text-[11.5px] text-faint">Effective {fmtDate(m.effective, { day: "numeric", month: "short", year: "numeric" })}{m.outgoing ? ` · succeeds ${m.outgoing}` : ""}</div>}
        </div>
      </div>
      <p className="mt-2.5 text-[13px] text-ink/90">{p.summary}</p>
      <ul className="mt-2 space-y-1">
        {p.points.map((pt) => <li key={pt} className="flex gap-2 text-[12.5px] text-muted"><span className="text-faint">–</span>{pt}</li>)}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="eyebrow">Background via</span>
        {p.sources.map((s) => <SourceLink key={s.url} href={s.url}>{s.label}</SourceLink>)}
        {m.incoming && <SourceLink href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(m.incoming)}`}>LinkedIn search</SourceLink>}
      </div>
    </div>
  );
}

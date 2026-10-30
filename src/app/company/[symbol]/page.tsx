import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany } from "@/lib/sources";
import { processCompany } from "@/lib/pipeline/briefing";
import { buildResultsTable } from "@/lib/finance/results";
import { fiscalLabel } from "@/lib/finance/quarters";
import { ratio } from "@/lib/finance/change";
import { FeedCard, ResultsTableView } from "@/components/FeedCard";
import { BarLine, Empty, Pct, ProvenanceChip, SectionTitle, SourceLink } from "@/components/ui";
import { fmtPrice, fmtDate } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!/^[A-Za-z0-9&\-]{1,20}$/.test(symbol)) notFound();
  const { company: c } = await getCompany(symbol);
  if (!c) notFound();
  const feed = processCompany(c).sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  const material = feed.filter((i) => i.tier !== "routine");
  const routine = feed.filter((i) => i.tier === "routine");
  const q = c.quarters;
  const latest = q.headers[q.headers.length - 1];
  const table = latest ? buildResultsTable(c, latest) : null;
  const rev = q.rows.Sales ?? q.rows.Revenue, pat = q.rows["Net Profit"], op = q.rows["Operating Profit"];
  const labels = q.headers.map(fiscalLabel);

  return (
    <div className="space-y-9">
      <div>
        <Link href="/portfolio" className="text-[12px] text-muted hover:text-ink">← Holdings</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{c.sector}{c.bse ? ` · BSE ${c.bse}` : ""}</div>
            <h1 className="mt-1 text-[24px] font-medium tracking-tight sm:text-[28px]">{c.name} <span className="num text-[16px] text-muted">{c.symbol}</span></h1>
          </div>
          <div className="text-right">
            <div className="num text-[22px] text-ink">{fmtPrice(c.price?.value)}</div>
            <div className="text-[12px]"><Pct v={c.price?.changePct ?? null} /> <span className="text-faint">· {c.price?.asOfText ?? "no quote"}</span></div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ProvenanceChip p={c.provenance.announcements} label="Filings" />
          <ProvenanceChip p={c.provenance.price} label="Price" />
          <ProvenanceChip p={c.provenance.fundamentals} label="Financials" />
        </div>
        <Link href={`/research/${c.symbol}`} className="mt-4 inline-flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-3 py-2 text-[13px] text-ink hover:border-accent/50">Open research report <span className="text-faint">· narrative vs numbers →</span></Link>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="13 quarters · ₹ crore" title="Revenue and margin" />
          {rev ? <BarLine labels={labels} bars={rev} line={c.kind === "corporate" && op ? rev.map((r, i) => ratio(op[i], r)) : undefined} barLabel="Revenue" lineLabel={c.kind === "corporate" ? "EBITDA margin" : undefined} /> : <Empty title="No quarterly data" />}
        </div>
        <div>
          <SectionTitle eyebrow="13 quarters · ₹ crore" title="Profit after tax" />
          {pat ? <BarLine labels={labels} bars={pat} barLabel="PAT" /> : <Empty title="No quarterly data" />}
        </div>
      </section>

      {table && <section><ResultsTableView t={table} /></section>}

      <section>
        <SectionTitle eyebrow={`${material.length} material · ${routine.length} routine`} title="Filings, ranked by FINN" />
        {material.length ? <div className="space-y-2.5">{material.map((i) => <FeedCard key={i.id} item={i} />)}</div> : <Empty title="No material filings on file" />}
        {routine.length > 0 && (
          <details className="mt-3 rounded-lg border hairline bg-panel">
            <summary className="px-4 py-3 text-[13px] text-muted"><span className="chev mr-2">›</span>{routine.length} routine filings</summary>
            <ul className="divide-y divide-line border-t hairline">
              {routine.map((r) => <li key={r.id} className="flex gap-3 px-4 py-2 text-[12.5px]"><span className="w-24 shrink-0 text-faint">{CATEGORY_LABEL[r.category]}</span><a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-muted hover:text-ink">{r.title}</a><span className="num text-faint">{fmtDate(r.date)}</span></li>)}
            </ul>
          </details>
        )}
      </section>

      <section>
        <SectionTitle eyebrow="Primary sources" title="Documents" />
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {c.concalls.slice(0, 6).map((cc) => (
            <div key={cc.period + (cc.transcript ?? cc.ppt)} className="flex flex-wrap gap-x-3 text-[12.5px]">
              <span className="num w-16 text-faint">{cc.period}</span>
              {cc.transcript && <SourceLink href={cc.transcript}>Transcript</SourceLink>}
              {cc.ppt && <SourceLink href={cc.ppt}>Presentation</SourceLink>}
            </div>
          ))}
          {c.annualReports.slice(0, 3).map((a) => <div key={a.year} className="flex gap-3 text-[12.5px]"><span className="num w-16 text-faint">FY{a.year.slice(2)}</span><SourceLink href={a.url}>Annual report</SourceLink></div>)}
        </div>
      </section>
    </div>
  );
}

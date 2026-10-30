import Link from "next/link";
import { buildReport } from "@/lib/research/report";
import { dataMode } from "@/lib/sources";
import type { ResearchReport, Section } from "@/lib/research/types";
import { FactList, GuidanceTrackCard, SeriesChart } from "@/components/research";
import { Empty, KindChip, Pct, ProvenanceChip, SectionTitle, SourceLink } from "@/components/ui";
import { TickerSearch } from "@/components/TickerSearch";
import { fmtCr, fmtDate, fmtPrice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAV = [["snapshot", "Snapshot"], ["narrative", "Narrative vs numbers"], ["guidance", "Guidance"], ["business", "Business"], ["trajectory", "Trajectory"], ["balance", "Balance sheet"], ["cash", "Cash quality"], ["flags", "Red flags"], ["bullbear", "Bull vs bear"], ["docs", "Sources"]];

export default async function ResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const valid = /^[A-Z0-9&\-]{1,20}$/.test(symbol);
  const r = valid ? await buildReport(symbol) : null;
  if (!r) return <NotFound symbol={symbol} />;

  return (
    <div className="mx-auto max-w-[920px]">
      <Link href="/research" className="text-[12px] text-muted hover:text-ink">← Research</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{r.sector} · {r.kind === "corporate" ? "Company" : r.kind === "bank" ? "Bank" : "NBFC"}</div>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight sm:text-[30px]">{r.name} <span className="num text-[16px] text-muted">{r.symbol}</span></h1>
        </div>
        <div className="text-right">
          <div className="num text-[20px]">{fmtPrice(r.price.value)}</div>
          <div className="text-[11.5px] text-faint"><Pct v={r.price.changePct} /> · {r.price.asOf ?? "no quote"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ProvenanceChip p={r.provenance.fundamentals} label="Financials" />
        {r.provenance.dossier && <ProvenanceChip p={r.provenance.dossier} label="Disclosures" />}
      </div>
      <Legend />

      <nav className="sticky top-[53px] z-20 -mx-4 mt-5 overflow-x-auto border-y hairline bg-bg/95 px-4 backdrop-blur scrollbar-none lg:top-0" aria-label="Report sections">
        <div className="flex gap-4 py-2.5 text-[12.5px]">
          {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 text-muted hover:text-ink">{label}</a>)}
        </div>
      </nav>

      <div className="mt-7 space-y-12">
        <Block id="snapshot" eyebrow="Financial snapshot" title="Where it stands" s={r.snapshot}>
          <div className="grid gap-px overflow-hidden rounded-lg border hairline bg-line sm:grid-cols-3">
            {r.snapshot.data.facts.map((f) => (
              <div key={f.label} className="bg-panel px-3.5 py-3">
                <div className="flex items-center justify-between"><span className="eyebrow !text-[9.5px]">{f.label}</span><KindChip kind={f.kind} /></div>
                <div className={`num mt-1 text-[18px] ${f.tone === "pos" ? "text-pos" : f.tone === "neg" ? "text-neg" : "text-ink"}`}>{f.value}</div>
                <div className="text-[11px] text-faint">{[f.period, f.detail].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
        </Block>

        <Narrative r={r} />

        <Block id="guidance" eyebrow="Management guidance" title="What they say is coming" s={r.guidance}>
          <div className="rounded-lg border hairline bg-panel px-4"><FactList facts={r.guidance.data.items} /></div>
        </Block>

        <Block id="business" eyebrow="Business snapshot" title="What the company does" s={r.business}>
          {r.business.data.summary && <div className="flex gap-2.5"><KindChip kind={r.business.data.summaryKind} /><p className="text-[14px] leading-relaxed text-ink/90">{r.business.data.summary}</p></div>}
          {r.business.data.segments.length > 0 && <Segments r={r} />}
          {r.business.data.evidence.length > 0 && <div className="mt-3 rounded-lg border hairline bg-panel px-4"><FactList facts={r.business.data.evidence} dense /></div>}
          {!r.business.data.summary && r.business.data.context && (
            <p className="text-[13px] text-muted"><span className="text-faint">Context (screener.in description, not used in analysis): </span>{r.business.data.context}</p>
          )}
        </Block>

        <Block id="trajectory" eyebrow="Multi-year trajectory" title="What's growing, what's compressing" s={r.trajectory}>
          <div className="grid gap-6 lg:grid-cols-2">
            {r.trajectory.data.annual.length > 0 && <div><div className="eyebrow mb-2">Annual</div><SeriesChart series={r.trajectory.data.annual} bar="Revenue" line={r.kind === "corporate" ? "EBITDA margin" : undefined} /></div>}
            <div><div className="eyebrow mb-2">Quarterly</div><SeriesChart series={r.trajectory.data.quarterly} bar={r.trajectory.data.annual.length ? "PAT" : "Revenue"} line={!r.trajectory.data.annual.length && r.kind === "corporate" ? "EBITDA margin" : undefined} /></div>
          </div>
          {r.trajectory.data.facts.length > 0 && <div className="mt-4 rounded-lg border hairline bg-panel px-4"><FactList facts={r.trajectory.data.facts} /></div>}
        </Block>

        <Block id="balance" eyebrow="Balance sheet" title="Debt, leverage, working capital" s={r.balanceSheet}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border hairline bg-panel px-4"><FactList facts={r.balanceSheet.data.facts} /></div>
            <div><SeriesChart series={r.balanceSheet.data.series} bar="Borrowings" /></div>
          </div>
        </Block>

        <Block id="cash" eyebrow="Cash quality" title="Do profits turn into cash?" s={r.cash}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border hairline bg-panel px-4"><FactList facts={r.cash.data.facts} /></div>
            <div><SeriesChart series={r.cash.data.series} bar="CFO" line="CFO / PAT" /></div>
          </div>
        </Block>

        <Block id="flags" eyebrow="Contradiction checks" title="Where the numbers disagree" s={r.contradictions}>
          {r.contradictions.data.items.length ? <div className="rounded-lg border hairline bg-panel px-4"><FactList facts={r.contradictions.data.items} /></div> : null}
          <p className="mt-2 text-[11.5px] text-faint">Checks run on every company: revenue vs operating cash, profit vs cash, debt vs interest cost, other-income dependence, growth at falling margins, receivable days.</p>
        </Block>

        <Block id="bullbear" eyebrow={r.bullBear.data.basis === "llm" ? "Synthesised from cited evidence" : "Assembled from the facts above"} title="Bull vs bear" s={r.bullBear}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-pos/25 bg-pos/[0.04] px-4 py-2"><div className="eyebrow mt-1 !text-pos">Bull</div><FactList facts={r.bullBear.data.bull} dense /></div>
            <div className="rounded-lg border border-neg/25 bg-neg/[0.04] px-4 py-2"><div className="eyebrow mt-1 !text-neg">Bear</div><FactList facts={r.bullBear.data.bear} dense /></div>
          </div>
        </Block>

        <section id="docs" className="scroll-mt-28">
          <SectionTitle eyebrow="Primary sources" title="Documents behind this report" />
          <ul className="divide-y divide-line rounded-lg border hairline bg-panel">
            {r.documents.map((d) => (
              <li key={d.id + d.url} className="flex items-baseline gap-3 px-4 py-2.5">
                <span className="w-20 shrink-0 text-[11px] uppercase tracking-[0.08em] text-faint">{(d.type ?? "doc").replace("_", " ")}</span>
                <span className="flex-1"><SourceLink href={d.url} detail={d.period}>{d.title}</SourceLink></span>
                {d.date && <span className="num text-[11px] text-faint">{fmtDate(d.date)}</span>}
              </li>
            ))}
          </ul>
          {r.warnings.length > 0 && <div className="mt-3 text-[11.5px] text-faint">Notes: {r.warnings.join(" · ")}</div>}
        </section>
      </div>
    </div>
  );
}

function Narrative({ r }: { r: ResearchReport }) {
  const n = r.narrative;
  return (
    <section id="narrative" className="scroll-mt-28">
      <div className="rounded-xl border border-line2 bg-gradient-to-b from-panel2 to-panel p-4 sm:p-5">
        <SectionTitle eyebrow="The standout check" title="Narrative vs numbers" right={<span className="text-[11.5px] text-faint">promised → delivered</span>} />
        <p className="-mt-1 mb-4 max-w-2xl text-[13px] text-muted">Every explicit guidance range management gave, call by call, against what was later reported. Verdicts are arithmetic; ranges and quotes link to the page they came from.</p>
        {n.status === "unavailable" ? (
          <Empty title="Not enough primary evidence to judge">{n.note}</Empty>
        ) : (
          <div className="space-y-5">
            {n.data.guidanceNote && <div className="flex gap-2.5 rounded-md border border-dashed border-line2 px-3 py-2.5"><KindChip kind="calc" /><p className="text-[13px] text-ink/90">{n.data.guidanceNote}</p></div>}
            {n.data.credibility.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">Credibility, by the record</div>
                <div className="grid gap-px overflow-hidden rounded-lg border hairline bg-line sm:grid-cols-2">
                  {n.data.credibility.map((c) => (
                    <div key={c.label} className="bg-panel px-3.5 py-2.5">
                      <div className="text-[11.5px] text-muted">{c.label}</div>
                      <div className={`mt-0.5 text-[14px] ${c.tone === "pos" ? "text-pos" : c.tone === "neg" ? "text-neg" : "text-ink"}`}>{c.value}</div>
                      {c.detail && <div className="mt-0.5 text-[11px] leading-snug text-faint">{c.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {n.data.tracks.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{n.data.tracks.map((t) => <GuidanceTrackCard key={t.key} t={t} />)}</div>}
            {n.data.divergences.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">Where story and numbers diverge</div>
                <div className="rounded-lg border border-ai/25 bg-panel px-4"><FactList facts={n.data.divergences} /></div>
              </div>
            )}
            {n.data.commentary.length > 0 && (
              <div>
                <div className="eyebrow mb-1.5">What management emphasised, call by call</div>
                <ol className="relative space-y-3 border-l border-line2 pl-4">
                  {n.data.commentary.map((m, i) => (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${m.tone === "pos" ? "bg-pos" : m.tone === "neg" ? "bg-med" : "bg-faint"}`} />
                      <div className="flex items-baseline gap-2 text-[11.5px]"><span className="num text-ink/90">{m.label}</span><span className="text-faint">{m.theme}</span><KindChip kind="mgmt" /></div>
                      <p className="mt-0.5 text-[13px] text-ink/85">{m.value}</p>
                      {m.source && <SourceLink href={m.source.url} detail={m.source.loc}>{m.source.title}</SourceLink>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {n.data.method && <p className="text-[11px] leading-relaxed text-faint">Method: {n.data.method}</p>}
          </div>
        )}
        {n.status === "unavailable" && n.data.transcripts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">{n.data.transcripts.map((t) => <SourceLink key={t.url} href={t.url}>{t.title}</SourceLink>)}</div>
        )}
      </div>
    </section>
  );
}

function Segments({ r }: { r: ResearchReport }) {
  const segs = r.business.data.segments;
  const total = segs.reduce((s, x) => s + x.value, 0);
  const pctUnit = segs[0]?.unit === "%";
  return (
    <div className="mt-3">
      {r.business.data.segmentsBasis && <div className="eyebrow mb-1.5">{r.business.data.segmentsBasis}</div>}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
        {segs.map((s, i) => <div key={s.name} style={{ width: `${(s.value / total) * 100}%`, opacity: 1 - i * 0.16 }} className="bg-calc" title={s.name} />)}
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {segs.map((s) => (
          <li key={s.name} className="flex items-baseline justify-between gap-2 text-[12.5px]">
            <span className="text-ink/90">{s.name}{s.derived && <span className="text-faint"> (derived)</span>}</span>
            <span className="num text-muted">{pctUnit ? `${s.value}%` : `₹${fmtCr(s.value)} cr`}{s.ebitda != null && <span className="text-faint"> · EBITDA ₹{fmtCr(s.ebitda)}</span>}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5"><SourceLink href={segs[0].source.url} detail={segs[0].source.period}>{segs[0].source.title}</SourceLink></div>
    </div>
  );
}

function Block<T>({ id, eyebrow, title, s, children }: { id: string; eyebrow: string; title: string; s: Section<T>; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <SectionTitle eyebrow={eyebrow} title={title} />
      {s.status === "unavailable" ? <Empty title="Not available">{s.note}</Empty> : (
        <>
          {s.note && <p className="-mt-1 mb-3 text-[12.5px] text-muted">{s.note}</p>}
          {children}
        </>
      )}
    </section>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-faint">
      <span className="inline-flex items-center gap-1.5"><KindChip kind="reported" /> disclosed</span>
      <span className="inline-flex items-center gap-1.5"><KindChip kind="calc" /> computed by FINN</span>
      <span className="inline-flex items-center gap-1.5"><KindChip kind="mgmt" /> management claim</span>
      <span className="inline-flex items-center gap-1.5"><KindChip kind="ai" /> interpretation</span>
    </div>
  );
}

function NotFound({ symbol }: { symbol: string }) {
  const snap = dataMode() === "snapshot";
  return (
    <div className="mx-auto max-w-[640px]">
      <Link href="/research" className="text-[12px] text-muted hover:text-ink">← Research</Link>
      <h1 className="mt-3 text-[22px] font-medium">No data for <span className="num">{symbol}</span></h1>
      <p className="mt-2 text-[14px] text-muted">
        {snap ? "This deployment is running on the recorded snapshot, which covers the portfolio plus the demo set. Any other NSE ticker needs live mode (screener.in reachable from the server)." : "FINN couldn't find standardised financials for that symbol. Check it's an NSE symbol (e.g. TCS, not Tata Consultancy), or try the company name."}
      </p>
      <div className="mt-5"><TickerSearch autoFocus /></div>
    </div>
  );
}

import Link from "next/link";
import { TickerSearch } from "@/components/TickerSearch";
import { RESEARCH_DEMO } from "@/lib/portfolio";
import { llmStatus } from "@/lib/llm";
import { dataMode } from "@/lib/sources";

export const dynamic = "force-dynamic";

export default function ResearchIndex() {
  const llm = llmStatus();
  return (
    <div className="mx-auto max-w-[760px]">
      <div className="eyebrow">Pull · on-demand research</div>
      <h1 className="mt-1 text-[24px] font-medium tracking-tight sm:text-[28px]">Research any NSE company</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Built only from primary disclosures — results, annual reports, earnings-call transcripts and investor presentations. Financial sections are computed in code;
        the language model reads transcripts and must quote them verbatim. No broker notes, no news, no model memory.
      </p>
      <div className="mt-6"><TickerSearch /></div>

      <div className="mt-8">
        <div className="eyebrow mb-2">Demo set</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {RESEARCH_DEMO.map((d) => (
            <Link key={d.symbol} href={`/research/${d.symbol}`} className="rounded-lg border hairline bg-panel px-3.5 py-3 hover:border-line2">
              <div className="num text-[14px] text-ink">{d.symbol}</div>
              <div className="text-[12.5px] text-muted">{d.why}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-3 rounded-lg border hairline bg-panel p-4 text-[12.5px] text-muted sm:grid-cols-3">
        <div><div className="eyebrow mb-1">Data</div>{dataMode() === "snapshot" ? "Recorded snapshot (30 Oct 2026). Tickers outside it need live mode." : "Live: screener.in financials + exchange/IR transcripts, with snapshot fallback."}</div>
        <div><div className="eyebrow mb-1">Extraction</div>{llm.enabled ? `${llm.provider}: ${llm.models!.fast} (extraction) · ${llm.models!.reasoning} (synthesis)` : "No LLM key on this deployment — computed sections only; curated evidence for the demo set."}</div>
        <div><div className="eyebrow mb-1">Rule</div>No guidance is inferred. If management gave no number, FINN says so.</div>
      </div>
    </div>
  );
}

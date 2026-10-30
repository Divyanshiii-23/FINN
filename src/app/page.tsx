import Link from "next/link";
import { buildBriefing } from "@/lib/pipeline/briefing";
import { BriefClient } from "@/components/BriefClient";
import { ProvenanceChip } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOWS = [{ h: 24, label: "24h" }, { h: 72, label: "3 days" }, { h: 168, label: "7 days" }, { h: 720, label: "30 days" }];

export default async function BriefPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const hours = WINDOWS.some((x) => String(x.h) === w) ? Number(w) : 24;
  const b = await buildBriefing(hours);
  const ref = new Date(b.referenceTime);
  const day = ref.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  const time = ref.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Portfolio brief · 15 holdings</div>
          <h1 className="mt-1 text-[24px] font-medium tracking-tight sm:text-[28px]">{day}</h1>
          <div className="mt-0.5 text-[12.5px] text-muted">As of {time} IST{b.mode === "snapshot" ? " · recorded snapshot" : ""}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {b.sources.map((s, i) => <ProvenanceChip key={s.provider + i} p={s} compact label={["Filings", "Prices", "Financials"][i]} />)}
        </div>
      </div>

      {b.mode === "snapshot" && (
        <details className="mt-4 rounded-md border border-accent/25 bg-accent/[0.06] px-3 py-2 text-[12.5px] leading-relaxed text-ink/85">
          <summary><span className="font-medium text-accent">Recorded snapshot</span> <span className="text-muted">· real filings &amp; financials, 30 Oct 23:30 IST</span> <span className="chev ml-1 text-faint">›</span></summary>
          <p className="mt-1.5 text-muted">Live exchange and price sources were unreachable from this deployment, so FINN is running on filings and financials recorded from screener.in. Nothing here is synthetic — every item links to its BSE filing. Price-volume history (for volume alerts) is live-only.</p>
        </details>
      )}

      <nav className="mt-5 flex gap-1 overflow-x-auto scrollbar-none" aria-label="Digest window">
        {WINDOWS.map((x) => {
          const c = b.windowCounts.find((k) => k.hours === x.h);
          const on = x.h === hours;
          return (
            <Link key={x.h} href={x.h === 24 ? "/" : `/?w=${x.h}`} scroll={false} aria-current={on ? "true" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${on ? "border-line2 bg-panel2 text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              {x.label}
              {c && <span className="num flex items-center gap-1 text-[11px] text-faint" title={`${c.high} high priority · ${c.surfaced} surfaced`}>{c.high > 0 && <span className="rounded bg-high/15 px-1 text-high">{c.high}</span>}{c.surfaced}</span>}
            </Link>
          );
        })}
      </nav>

      <BriefClient briefing={b} hours={hours} />
    </div>
  );
}

import type { Fact, GuidanceTrack, Series } from "@/lib/research/types";
import { BarLine, KindChip, SourceLink } from "./ui";
import { fmtDate } from "@/lib/format";

export function FactList({ facts, dense }: { facts: Fact[]; dense?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {facts.map((f, i) => (
        <li key={i} className={`flex gap-3 ${dense ? "py-2" : "py-2.5"}`}>
          <KindChip kind={f.kind} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[13px] text-ink/90">{f.label}</span>
              {f.value && <span className={`num text-[13px] ${f.tone === "pos" ? "text-pos" : f.tone === "neg" ? "text-neg" : "text-ink"}`}>{f.value}</span>}
            </div>
            {(f.detail || f.period) && <div className="mt-0.5 text-[12px] text-muted">{[f.period, f.detail].filter(Boolean).join(" · ")}</div>}
            {f.source && <div className="mt-1"><SourceLink href={f.source.url} detail={[f.source.period, f.source.loc].filter(Boolean).join(" · ")}>{f.source.title}</SourceLink></div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

const VERDICT: Record<GuidanceTrack["verdict"]["code"], { label: string; cls: string }> = {
  met: { label: "Delivered", cls: "text-pos border-pos/40 bg-pos/10" },
  beat: { label: "Beat", cls: "text-pos border-pos/40 bg-pos/10" },
  missed: { label: "Missed", cls: "text-neg border-neg/40 bg-neg/10" },
  tracking_within: { label: "On track", cls: "text-calc border-calc/40 bg-calc/10" },
  tracking_above: { label: "Ahead", cls: "text-pos border-pos/40 bg-pos/10" },
  tracking_below: { label: "Behind", cls: "text-neg border-neg/40 bg-neg/10" },
  pending: { label: "No data yet", cls: "text-faint border-line2" },
  qualitative: { label: "Qualitative", cls: "text-mgmt border-mgmt/35" },
};


export function GuidanceTrackCard({ t }: { t: GuidanceTrack }) {
  const v = VERDICT[t.verdict.code];
  const explicit = t.points.filter((p) => p.low != null && p.high != null);
  const values = [...explicit.flatMap((p) => [p.low!, p.high!]), ...(t.unit === "bps" ? [] : t.actuals.map((a) => a.value))];
  const unitIsBps = t.unit === "bps";
  const lo = Math.min(...values), hi = Math.max(...values);
  const pad = (hi - lo) * 0.18 || 1;
  const min = lo - pad, max = hi + pad;
  const x = (val: number) => `${((val - min) / (max - min)) * 100}%`;
  const fyActual = t.actuals.find((a) => a.scope === "fy");
  // Same selection as the evaluator, so the marker and the verdict text always agree.
  const probe = fyActual ?? t.actuals.find((a) => a.scope === "ytd") ?? [...t.actuals].reverse().find((a) => a.scope.startsWith("quarter"));
  return (
    <div className="rounded-lg border hairline bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b hairline px-4 py-3">
        <span className="num rounded border border-line2 px-1.5 py-px text-[11px] text-muted">{t.fy}</span>
        <h4 className="text-[14px] font-medium text-ink">{t.label}</h4>
        <span className={`ml-auto rounded border px-1.5 py-px text-[10.5px] font-medium uppercase tracking-[0.08em] ${v.cls}`}>{v.label}</span>
      </div>
      <div className="space-y-3 px-4 py-3.5">
        {explicit.length > 0 && !unitIsBps && (
          <div className="space-y-2" role="img" aria-label={`Guidance ranges by call for ${t.fy} ${t.label}`}>
            {explicit.map((p, i) => (
              <div key={i} className="grid grid-cols-[64px_1fr_76px] items-center gap-2">
                <span className="num text-[11px] text-muted">{p.givenIn}</span>
                <div className="relative h-5">
                  <div className="absolute inset-y-[9px] left-0 right-0 bg-line" />
                  <div className="absolute inset-y-[5px] rounded-sm border border-mgmt/50 bg-mgmt/20" style={{ left: x(p.low!), width: `calc(${x(p.high!)} - ${x(p.low!)})`, minWidth: 3 }} />
                  {probe && i === explicit.length - 1 && (
                    <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: x(probe.value) }} title={`${probe.period}: ${probe.value}${t.unit === "%" ? "%" : ""}`} />
                  )}
                </div>
                <span className="num text-right text-[11.5px] text-ink/90">{p.low === p.high ? p.low : `${p.low}–${p.high}`}{t.unit === "%" ? "%" : ` ${t.unit}`}</span>
              </div>
            ))}
            {probe && (
              <div className="grid grid-cols-[64px_1fr_76px] items-center gap-2 border-t border-dashed border-line pt-2">
                <span className="num text-[11px] text-ink">Actual</span>
                <span className="min-w-0 truncate text-[11.5px] text-muted">{probe.period}{probe.scope === "ytd" ? " (year to date)" : ""}{probe.derived ? " · FINN-derived" : ""} · <a href={probe.source.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line2 underline-offset-2 hover:text-ink">{probe.source.loc ?? "source"}</a></span>
                <span className="num text-right text-[12px] font-medium text-ink">{probe.value}{t.unit === "%" ? "%" : ` ${t.unit}`}</span>
              </div>
            )}
          </div>
        )}
        {t.points.some((p) => p.type === "qualitative") && t.points.map((p, i) => p.statement && (
          <div key={i} className="flex gap-2"><KindChip kind="mgmt" /><p className="text-[13px] text-ink/90">{p.statement} <span className="text-faint">— {p.givenIn}</span></p></div>
        ))}
        <p className="text-[13px] leading-relaxed text-ink/90">{t.verdict.text}</p>
        <p className="text-[12.5px] text-muted">{t.revision.direction === "lowered" ? "↓ " : t.revision.direction === "raised" ? "↑ " : ""}{t.revision.text}</p>
        {t.derivations.length > 0 && <FactList facts={t.derivations} dense />}
        <div className="flex flex-col gap-1 border-t hairline pt-2.5">
          {t.points.map((p, i) => <SourceLink key={i} href={p.source.url} detail={[p.givenIn, p.source.loc].filter(Boolean).join(" · ")}>{p.source.title}</SourceLink>)}

        </div>
      </div>
    </div>
  );
}

export function SeriesChart({ series, bar, line }: { series: Series[]; bar: string; line?: string }) {
  const b = series.find((s) => s.label === bar);
  const l = line ? series.find((s) => s.label === line) : undefined;
  if (!b) return null;
  return <BarLine labels={b.points.map((p) => p.x)} bars={b.points.map((p) => p.y)} line={l?.points.map((p) => p.y)} barLabel={`${b.label} (${b.unit})`} lineLabel={l ? `${l.label}${l.unit === "%" ? " %" : ""}` : undefined} />;
}

export function DocDate({ d }: { d?: string }) {
  return d ? <span className="num text-faint">{fmtDate(d)}</span> : null;
}

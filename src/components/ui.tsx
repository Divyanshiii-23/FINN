import type { Change, Provenance, Tier } from "@/lib/types";
import type { FactKind } from "@/lib/research/types";

export function TierBadge({ tier, score }: { tier: Tier; score?: number }) {
  const map: Record<Tier, { label: string; cls: string }> = {
    high: { label: "High", cls: "text-high border-high/40 bg-high/10" },
    medium: { label: "Review", cls: "text-med border-med/35 bg-med/10" },
    low: { label: "Note", cls: "text-low border-low/35 bg-low/10" },
    routine: { label: "Routine", cls: "text-faint border-line2 bg-transparent" },
  };
  const m = map[tier];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-[1px] text-[10.5px] font-medium uppercase tracking-[0.08em] ${m.cls}`}>
      {m.label}
      {score != null && <span className="num opacity-80">{score}</span>}
    </span>
  );
}

const KIND: Record<FactKind, { label: string; cls: string; title: string }> = {
  reported: { label: "Reported", cls: "text-muted border-line2", title: "As disclosed in a company filing / standardised statement" },
  calc: { label: "Calc", cls: "text-calc border-calc/35", title: "Computed by FINN from reported numbers (deterministic)" },
  mgmt: { label: "Mgmt", cls: "text-mgmt border-mgmt/35", title: "Management's own statement or claim" },
  ai: { label: "AI", cls: "text-ai border-ai/40 border-dashed", title: "Interpretation — a judgement, not a disclosed fact" },
};
export function KindChip({ kind }: { kind: FactKind }) {
  const k = KIND[kind];
  return <span title={k.title} className={`inline-flex h-fit shrink-0 self-start items-center rounded-sm border px-1 py-px font-mono text-[9.5px] uppercase tracking-[0.1em] ${k.cls}`}>{k.label}</span>;
}

export function Delta({ c, size = "sm" }: { c: Change | null | undefined; size?: "sm" | "xs" }) {
  if (!c) return <span className="text-faint">—</span>;
  const cls = c.direction === "up" ? "text-pos" : c.direction === "down" ? "text-neg" : "text-muted";
  return <span title={c.note} className={`num ${cls} ${size === "xs" ? "text-[11px]" : "text-[12.5px]"}`}>{c.display}</span>;
}

export function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  if (v == null) return <span className="text-faint num">—</span>;
  return <span className={`num ${v > 0 ? "text-pos" : v < 0 ? "text-neg" : "text-muted"}`}>{v > 0 ? "+" : v < 0 ? "−" : ""}{Math.abs(v).toFixed(digits)}%</span>;
}

export function ProvenanceChip({ p, compact, label: subject }: { p: Provenance; compact?: boolean; label?: string }) {
  const dot = p.mode === "live" ? "bg-pos live-dot" : p.mode === "snapshot" ? "bg-accent" : "bg-neg";
  const label = p.mode === "live" ? "Live" : p.mode === "snapshot" ? "Snapshot" : "Unavailable";
  const when = new Date(p.asOf).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <span title={[p.provider, p.note].filter(Boolean).join(" — ")} className="inline-flex items-center gap-1.5 rounded-full border hairline bg-panel px-2 py-0.5 text-[11px] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {subject && <span className="text-muted">{subject}</span>}
      <span className="text-ink/90">{label}</span>
      {!compact && <span className="text-faint">· {p.provider} · {when}</span>}
    </span>
  );
}

export function SourceLink({ href, children, detail }: { href: string; children: React.ReactNode; detail?: string }) {
  if (!href || href === "#") return <span className="text-faint">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-baseline gap-1 text-[12px] text-muted underline decoration-line2 underline-offset-[3px] hover:text-ink hover:decoration-accent">
      <span>{children}</span>
      {detail && <span className="text-faint group-hover:text-muted">· {detail}</span>}
      <svg width="9" height="9" viewBox="0 0 12 12" className="shrink-0 translate-y-[1px] opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2h6v6M10 2L3 9" /></svg>
    </a>
  );
}

export function SectionTitle({ eyebrow, title, right, id }: { eyebrow?: string; title: string; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-3 flex items-end justify-between gap-3 scroll-mt-28">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="text-[17px] font-medium tracking-tight text-ink">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line2 px-4 py-6 text-center">
      <div className="text-sm text-ink">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function Sparkline({ values, width = 84, height = 24, tone = "auto" }: { values: (number | null)[]; width?: number; height?: number; tone?: "auto" | "muted" }) {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 2) return <span className="inline-block text-faint" style={{ width }}>—</span>;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * (width - 2) + 1},${height - 2 - ((y - min) / span) * (height - 4)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  const color = tone === "muted" ? "var(--color-muted)" : up ? "var(--color-pos)" : "var(--color-neg)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(width - 2) + 1} cy={height - 2 - ((v[v.length - 1] - min) / span) * (height - 4)} r="1.8" fill={color} />
    </svg>
  );
}

/** Small multiple: bars for values, optional line overlay (e.g. margin %). Pure SVG, no chart library. */
export function BarLine({ labels, bars, line, barLabel, lineLabel, height = 140 }: { labels: string[]; bars: (number | null)[]; line?: (number | null)[]; barLabel: string; lineLabel?: string; height?: number }) {
  const n = labels.length;
  const W = 640, H = height, pad = { l: 4, r: 4, t: 14, b: 22 };
  const bv = bars.filter((x): x is number => x != null);
  const bmax = Math.max(...bv, 0), bmin = Math.min(...bv, 0);
  const lv = (line ?? []).filter((x): x is number => x != null);
  const lmin = Math.min(...lv), lmax = Math.max(...lv);
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - bmin) / (bmax - bmin || 1));
  const ly = (v: number) => pad.t + 4 + (H - pad.t - pad.b - 8) * (1 - (v - lmin) / (lmax - lmin || 1));
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${barLabel}${lineLabel ? ` and ${lineLabel}` : ""} by period`}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--color-line2)" />
        {bars.map((v, i) => v == null ? null : (
          <g key={i}>
            <rect x={pad.l + i * bw + bw * 0.18} width={bw * 0.64} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="1.5" fill={i === n - 1 ? "var(--color-ink)" : v < 0 ? "var(--color-neg)" : "#3a4352"} opacity={i === n - 1 ? 0.92 : 1} />
            <title>{`${labels[i]}: ${v.toLocaleString("en-IN")}`}</title>
          </g>
        ))}
        {line && lv.length > 1 && (
          <polyline fill="none" stroke="var(--color-accent)" strokeWidth="1.6" points={line.map((v, i) => (v == null ? null : `${pad.l + i * bw + bw / 2},${ly(v)}`)).filter(Boolean).join(" ")} />
        )}
        {line?.map((v, i) => v == null ? null : <circle key={i} cx={pad.l + i * bw + bw / 2} cy={ly(v)} r="2.2" fill="var(--color-bg)" stroke="var(--color-accent)" strokeWidth="1.3"><title>{`${labels[i]}: ${v.toFixed(1)}%`}</title></circle>)}
        {labels.map((l, i) => (i % Math.ceil(n / 7) === 0 || i === n - 1) && <text key={i} x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-faint)" fontFamily="var(--font-mono)">{l}</text>)}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3a4352]" />{barLabel}</span>
        {lineLabel && <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-3 bg-accent" />{lineLabel}</span>}
      </figcaption>
    </figure>
  );
}

import type { Fact, GuidanceTrack, SourceRef } from "./types";

export interface Dossier {
  symbol: string;
  preparedAt: string;
  method: string;
  documents: Record<string, { title: string; date: string; period: string; type: string; url: string }>;
  business: { summary: string; segments: { name: string; value: number; ebitda?: number; unit?: string; period: string; doc: string; loc: string; derived?: boolean }[]; segmentsBasis?: string; evidence: { claim: string; doc: string; loc: string }[] };
  guidance: { id: string; fy: string; metric: string; label: string; low: number | null; high: number | null; unit: string; givenIn: string; date: string; type: "explicit" | "qualitative"; doc: string; loc: string; note?: string; statement?: string; lowerIsBetter?: boolean }[];
  guidanceNote?: string;
  actuals: { metric: string; scope: string; period: string; value: number; unit: string; doc: string; loc: string; note?: string; derived?: boolean }[];
  kpis: { label: string; unit: string; series: { period: string; value: number; doc: string; loc: string }[] }[];
  commentary: { period: string; theme: string; tone: string; text: string; doc: string; loc: string }[];
}

export const ref = (d: Dossier, id: string, loc?: string): SourceRef => {
  const doc = d.documents[id];
  return doc ? { id, title: doc.title, url: doc.url, period: doc.period, date: doc.date, loc, type: doc.type } : { id, title: id, url: "#", loc };
};

const fmtRange = (lo: number | null, hi: number | null, u: string) => (lo == null && hi == null ? "qualitative" : lo === hi ? `${lo}${u}` : `${lo}–${hi}${u}`);
const mid = (lo: number | null, hi: number | null) => (lo == null || hi == null ? null : (lo + hi) / 2);
const fyOf = (period: string) => period.match(/FY\d{2}/)?.[0];

export function evaluate(d: Dossier): { tracks: GuidanceTrack[]; credibility: Fact[]; divergences: Fact[]; latestGuidance: Fact[] } {
  const groups = new Map<string, Dossier["guidance"]>();
  for (const g of d.guidance) groups.set(`${g.fy}:${g.metric}`, [...(groups.get(`${g.fy}:${g.metric}`) ?? []), g]);

  const tracks: GuidanceTrack[] = [];
  for (const [key, gs] of groups) {
    gs.sort((a, b) => a.date.localeCompare(b.date));
    const first = gs[0], latest = gs[gs.length - 1];
    const unit = first.unit === "%" ? "%" : ` ${first.unit}`;
    const relevant = d.actuals.filter((a) => a.metric === first.metric || (first.metric === "opex_to_nti_improvement_bps" && a.metric === "opex_to_nti"));
    const actuals = relevant.filter((a) => fyOf(a.period) === first.fy || a.period.includes(first.fy)).map((a) => ({ period: a.period, scope: a.scope, value: a.value, derived: a.derived, note: a.note, source: ref(d, a.doc, a.loc) }));
    const derivations: Fact[] = [];
    let verdict: GuidanceTrack["verdict"];

    if (latest.type === "qualitative") {
      verdict = { code: "qualitative", text: "Qualitative guidance — shown beside the reported numbers, not scored." };
    } else {
      const lo = latest.low!, hi = latest.high!;
      const lowerBetter = !!latest.lowerIsBetter;
      const fyActual = actuals.find((a) => a.scope === "fy" && a.period === first.fy);
      // opex improvement is guided as bps vs a baseline; derive it from the opex/NTI ratios
      if (first.metric === "opex_to_nti_improvement_bps") {
        const base = d.actuals.find((a) => a.metric === "opex_to_nti" && a.scope === "fy");
        const ytd = d.actuals.find((a) => a.metric === "opex_to_nti" && a.scope === "ytd");
        const q = d.actuals.find((a) => a.metric === "opex_to_nti" && a.scope === "quarter");
        if (base && (ytd || q)) {
          const imp = (x: number) => Math.round((base.value - x) * 100);
          if (q) derivations.push({ label: `${q.period} improvement vs ${base.period}`, value: `${imp(q.value)} bps`, kind: "calc", detail: `${base.value.toFixed(2)}% → ${q.value.toFixed(2)}%`, source: ref(d, q.doc, q.loc) });
          if (ytd) derivations.push({ label: `${ytd.period} improvement vs ${base.period}`, value: `${imp(ytd.value)} bps`, kind: "calc", detail: `${base.value.toFixed(2)}% → ${ytd.value.toFixed(2)}%`, source: ref(d, ytd.doc, ytd.loc) });
          const v = imp((ytd ?? q)!.value);
          verdict = v < lo ? { code: "tracking_below", text: `${(ytd ?? q)!.period} improvement of ${v} bps is below the ${lo}–${hi} bps guided${q && ytd && imp(q.value) >= lo ? `; the latest quarter alone (${imp(q.value)} bps) is inside the range` : ""}.` }
            : v > hi ? { code: "tracking_above", text: `${v} bps improvement — ahead of the ${lo}–${hi} bps guided.` }
            : { code: "tracking_within", text: `${v} bps improvement — inside the ${lo}–${hi} bps range.` };
        } else verdict = { code: "pending", text: "No reported opex/NTI yet for the year." };
      } else if (fyActual) {
        const v = fyActual.value;
        const inside = v >= lo && v <= hi;
        const better = lowerBetter ? v < lo : v > hi;
        verdict = inside ? { code: "met", text: `Delivered ${v}${unit} — inside the final ${fmtRange(lo, hi, unit)} range${v < (lo + hi) / 2 ? " (lower half)" : v > (lo + hi) / 2 ? " (upper half)" : " (at the midpoint)"}.` }
          : better ? { code: "beat", text: `Delivered ${v}${unit} — better than the ${fmtRange(lo, hi, unit)} guided.` }
          : { code: "missed", text: `Delivered ${v}${unit} — outside the ${fmtRange(lo, hi, unit)} guided.` };
        if (gs.length > 1 && first.low != null && first.high != null) {
          const vsInitial = v >= first.low && v <= first.high ? "inside" : v > first.high ? "above" : "below";
          derivations.push({ label: "Against the initial range", value: `${vsInitial} ${fmtRange(first.low, first.high, unit)}`, kind: "calc", detail: `First guided in ${first.givenIn}` });
        }
      } else {
        const ytd = actuals.find((a) => a.scope === "ytd");
        const lastQ = [...actuals].filter((a) => a.scope.startsWith("quarter")).pop();
        const probe = ytd ?? lastQ;
        if (!probe) verdict = { code: "pending", text: "No reported number yet for this metric in the retrieved documents." };
        else {
          const v = probe.value;
          const within = v >= lo && v <= hi;
          const good = lowerBetter ? v < lo : v > hi;
          verdict = within ? { code: "tracking_within", text: `${probe.period}: ${v}${unit}${probe.derived ? " (derived)" : ""} — inside the ${fmtRange(lo, hi, unit)} guided.` }
            : good ? { code: "tracking_above", text: `${probe.period}: ${v}${unit}${probe.derived ? " (derived)" : ""} — running ${lowerBetter ? "better than" : "ahead of"} the ${fmtRange(lo, hi, unit)} guided.` }
            : { code: "tracking_below", text: `${probe.period}: ${v}${unit} — ${lowerBetter ? "worse than" : "behind"} the ${fmtRange(lo, hi, unit)} guided.` };
          // Implied second half for growth guided on a full-year basis (equal-halves approximation).
          if (ytd && /H1/.test(ytd.period) && /growth/.test(first.metric)) {
            const h2lo = 2 * lo - ytd.value, h2hi = 2 * hi - ytd.value;
            derivations.push({ label: "Implied H2 growth to land in range", value: `${h2lo.toFixed(1)}% to ${h2hi.toFixed(1)}%`, kind: "calc", detail: `2 × full-year guide − H1 actual (${ytd.value}%); assumes equal halves`, tone: h2hi < ytd.value ? "neg" : "neutral" });
          }
          // When the company's headline metric excludes items, show both bases side by side.
          const quarterly = actuals.filter((a) => a.scope === "quarter");
          if (quarterly.length > 1 && quarterly.some((a) => a.derived)) for (const a of quarterly) derivations.push({ label: a.derived ? `${a.period} — FINN-derived` : `${a.period} — as reported`, value: `${a.value}${unit}`, kind: a.derived ? "calc" : "reported", detail: a.note ?? a.source.loc, source: a.source, tone: (lowerBetter ? a.value <= hi : a.value >= lo) ? "neutral" : "neg" });
        }
      }
    }

    // Revision path
    let revision: GuidanceTrack["revision"] = { direction: "single", text: `Guided once (${first.givenIn}).` };
    if (gs.length > 1 && latest.type === "explicit") {
      const path = gs.map((g) => fmtRange(g.low, g.high, unit)).join(" → ");
      const m0 = mid(first.low, first.high)!, m1 = mid(latest.low, latest.high)!;
      const w0 = (first.high ?? 0) - (first.low ?? 0), w1 = (latest.high ?? 0) - (latest.low ?? 0);
      const steps = gs.slice(1).map((g, i) => Math.sign((mid(g.low, g.high) ?? 0) - (mid(gs[i].low, gs[i].high) ?? 0)));
      const ups = steps.filter((s) => s > 0).length, downs = steps.filter((s) => s < 0).length;
      const delta = Math.round((m1 - m0) * 100);
      const direction: GuidanceTrack["revision"]["direction"] = m1 > m0 ? "raised" : m1 < m0 ? "lowered" : w1 < w0 ? "narrowed" : w1 > w0 ? "widened" : "unchanged";
      const times = direction === "raised" ? ups : direction === "lowered" ? downs : 0;
      revision = { direction, text: direction === "unchanged" ? `Held at ${path.split(" → ")[0]} across ${gs.length} calls.` : `${cap(direction)}${times > 1 ? ` ${times} times` : ""}: ${path}${unit === "%" && delta ? ` (midpoint ${delta > 0 ? "+" : "−"}${Math.abs(delta)} bps)` : ""}.` };
    }

    tracks.push({
      key, fy: first.fy, metric: first.metric, label: first.label, unit: first.unit, lowerIsBetter: first.lowerIsBetter,
      points: gs.map((g) => ({ givenIn: g.givenIn, date: g.date, low: g.low, high: g.high, type: g.type, statement: g.statement, note: g.note, source: ref(d, g.doc, g.loc) })),
      actuals, verdict, revision, derivations,
    });
  }
  tracks.sort((a, b) => b.fy.localeCompare(a.fy) || a.metric.localeCompare(b.metric));

  // Credibility: evidence counts, not a personality score.
  const credibility: Fact[] = [];
  const closed = tracks.filter((t) => ["met", "beat", "missed"].includes(t.verdict.code));
  if (closed.length) {
    const ok = closed.filter((t) => t.verdict.code !== "missed").length;
    credibility.push({ label: "Closed guidance (full years)", value: `${ok} of ${closed.length} delivered`, kind: "calc", detail: closed.map((t) => `${t.fy} ${t.label}: ${t.verdict.code}`).join(" · "), tone: ok === closed.length ? "pos" : "neg" });
  }
  const live = tracks.filter((t) => t.verdict.code.startsWith("tracking"));
  if (live.length) credibility.push({ label: "Open guidance (current year)", value: `${live.filter((t) => t.verdict.code !== "tracking_below").length} of ${live.length} on or ahead of track`, kind: "calc", detail: live.map((t) => `${t.label}: ${t.verdict.code.replace("tracking_", "")}`).join(" · "), tone: live.every((t) => t.verdict.code !== "tracking_below") ? "pos" : "neg" });
  const lowered = tracks.filter((t) => t.revision.direction === "lowered");
  const raised = tracks.filter((t) => t.revision.direction === "raised");
  if (lowered.length || raised.length) credibility.push({ label: "Within-year revisions", value: [raised.length ? `${raised.length} raised` : "", lowered.length ? `${lowered.length} lowered` : ""].filter(Boolean).join(", "), kind: "calc", detail: [...raised, ...lowered].map((t) => `${t.fy} ${t.label}: ${t.revision.text}`).join(" · "), tone: lowered.length ? "neg" : "pos" });
  const stable = tracks.filter((t) => t.revision.direction === "unchanged" && t.points.length > 1);
  if (stable.length) credibility.push({ label: "Held steady", value: stable.map((t) => `${t.fy} ${t.label.toLowerCase()}`).join(", "), kind: "calc", detail: "Guidance unchanged across successive calls", tone: "pos" });

  // Divergences: management-highlighted KPIs improving while guided/actual growth deteriorates.
  const divergences: Fact[] = [];
  const growthTrack = tracks.find((t) => /growth/.test(t.metric) && t.revision.direction === "lowered");
  for (const k of d.kpis) {
    if (k.series.length < 2 || !growthTrack) continue;
    const a = k.series[0], b = k.series[k.series.length - 1];
    if (b.value > a.value * 1.15)
      divergences.push({ label: `${k.label} up while growth guidance was cut`, value: `${a.value}${k.unit === "%" ? "%" : " " + k.unit} (${a.period}) → ${b.value}${k.unit === "%" ? "%" : " " + k.unit} (${b.period})`, kind: "ai",
        detail: `Management led with this metric; over the same span ${growthTrack.fy} ${growthTrack.label.toLowerCase()} guidance was ${growthTrack.revision.text.toLowerCase()} Either conversion lags (watch next two quarters) or the metric is not a leading indicator of revenue.`, source: ref(d, b.doc, b.loc), tone: "neg" });
  }
  const qa = d.actuals.filter((a) => a.scope === "quarter_yoy" && /growth/.test(a.metric));
  if (qa.length >= 3) {
    const lastTwo = qa.slice(-2), peak = qa.reduce((m, a) => (a.value > m.value ? a : m), qa[0]);
    if (lastTwo.every((a) => a.value < peak.value) && lastTwo[1].value < lastTwo[0].value)
      divergences.push({ label: "Reported growth decelerating", value: qa.map((a) => `${a.period} ${a.value}%`).join(" → "), kind: "calc", detail: `Two successive quarters below the ${peak.period} peak of ${peak.value}%.`, tone: "neg", source: ref(d, lastTwo[1].doc, lastTwo[1].loc) });
  }

  const latestGuidance: Fact[] = tracks.filter((t) => t.fy === tracks[0]?.fy).map((t) => {
    const p = t.points[t.points.length - 1];
    return { label: `${t.fy} ${t.label}`, value: p.type === "qualitative" ? "Qualitative" : fmtRange(p.low, p.high, t.unit === "%" ? "%" : ` ${t.unit}`), kind: "mgmt", period: p.givenIn, detail: p.statement ?? p.note ?? t.revision.text, source: p.source };
  });

  return { tracks, credibility, divergences, latestGuidance };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

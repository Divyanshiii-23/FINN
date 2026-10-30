import "server-only";
import { z } from "zod";
import type { Fact, ResearchReport, SourceRef } from "./types";
import { balanceSection, cashSection, contradictions, snapshotSection, trajectorySection } from "./metrics";
import { evaluate, ref, type Dossier } from "./narrative";
import { liveDossier } from "./live";
import { getCompany } from "../sources";
import { llmJson, llmStatus } from "../llm";
import { cached } from "../sources/http";
import INFY from "../../../data/research/INFY.json";
import BAJFINANCE from "../../../data/research/BAJFINANCE.json";
import RELIANCE from "../../../data/research/RELIANCE.json";

const DOSSIERS: Record<string, Dossier> = { INFY: INFY as unknown as Dossier, BAJFINANCE: BAJFINANCE as unknown as Dossier, RELIANCE: RELIANCE as unknown as Dossier };

export async function buildReport(symbolIn: string): Promise<ResearchReport | null> {
  const symbol = symbolIn.trim().toUpperCase();
  return cached(`report:${symbol}`, 30 * 60e3, () => assemble(symbol));
}

async function assemble(symbol: string): Promise<ResearchReport | null> {
  const { company: c, report } = await getCompany(symbol, { announcements: false });
  if (!c) return null;
  const warnings = [...report.failures];

  let dossier: Dossier | null = DOSSIERS[symbol] ?? null;
  let dossierMode: "snapshot" | "live" | null = dossier ? "snapshot" : null;
  if (!dossier) {
    const live = await liveDossier(c);
    warnings.push(...live.warnings);
    if (live.dossier) { dossier = live.dossier; dossierMode = "live"; }
  }

  const snapshot = snapshotSection(c);
  const trajectory = trajectorySection(c);
  const balanceSheet = balanceSection(c);
  const cash = cashSection(c);
  const flags = contradictions(c);
  const ev = dossier ? evaluate(dossier) : null;

  const transcripts: SourceRef[] = c.concalls.filter((x) => x.transcript).slice(0, 6).map((x) => ({ id: `cc-${x.period}`, title: `Earnings call · ${x.period}`, url: x.transcript!, period: x.period, type: "transcript" }));
  const narrativeStatus = ev && ev.tracks.length ? "ok" : dossier?.commentary.length || dossier?.guidanceNote ? "partial" : "unavailable";
  const narrativeNote = !dossier
    ? llmStatus().enabled ? "No guidance could be extracted from the linked transcripts." : "Narrative vs Numbers reads the last four earnings-call transcripts. This deployment has no LLM key, and FINN will not infer guidance without reading them — the transcripts are linked below."
    : dossier.guidanceNote;

  const business = dossier
    ? { status: "ok" as const, data: { summary: dossier.business.summary || null, summaryKind: "mgmt" as const, segments: dossier.business.segments.map((s) => ({ name: s.name, value: s.value, ebitda: s.ebitda, unit: s.unit, derived: s.derived, source: ref(dossier!, s.doc, s.loc) })), segmentsBasis: dossier.business.segmentsBasis, evidence: dossier.business.evidence.map((e): Fact => ({ label: e.claim, value: "", kind: "reported", source: ref(dossier!, e.doc, e.loc) })), context: c.about } }
    : { status: "partial" as const, note: "No primary-source segment disclosure in the snapshot; live mode with an LLM key summarises the annual report's MD&A.", data: { summary: null, summaryKind: "mgmt" as const, segments: [], evidence: [], context: c.about } };

  const bullBear = await buildBullBear(c.name, [...snapshot.data.facts, ...trajectory.data.facts, ...balanceSheet.data.facts, ...cash.data.facts], flags, ev);

  const documents: SourceRef[] = [
    ...(dossier ? Object.entries(dossier.documents).map(([id, d]) => ({ id, title: d.title, url: d.url, period: d.period, date: d.date, type: d.type })) : []),
    ...transcripts.filter((t) => !dossier || !Object.values(dossier.documents).some((d) => d.url === t.url)),
    ...c.annualReports.slice(0, 3).map((a) => ({ id: `ar-${a.year}`, title: `Annual report ${a.year}`, url: a.url, period: `FY${a.year.slice(2)}`, type: "annual_report" })),
  ];

  return {
    symbol: c.symbol, name: c.name, sector: c.sector, kind: c.kind, generatedAt: new Date().toISOString(),
    provenance: { fundamentals: c.provenance.fundamentals, dossier: dossier ? { mode: dossierMode!, provider: dossierMode === "live" ? `Transcripts + ${llmStatus().provider} extraction` : "Curated primary-source evidence (build-time)", asOf: dossier.preparedAt, note: dossier.method } : null },
    price: { value: c.price?.value ?? null, asOf: c.price?.asOfText ?? null, changePct: c.price?.changePct ?? null },
    business,
    snapshot,
    trajectory,
    balanceSheet,
    cash,
    narrative: { status: narrativeStatus, note: narrativeNote, data: { tracks: ev?.tracks ?? [], commentary: (dossier?.commentary ?? []).map((m) => ({ label: m.period, value: m.text, kind: "mgmt" as const, theme: m.theme, tone: m.tone === "positive" ? "pos" : m.tone === "cautious" || m.tone === "negative" ? "neg" : "neutral", source: ref(dossier!, m.doc, m.loc) })), credibility: ev?.credibility ?? [], divergences: ev?.divergences ?? [], guidanceNote: dossier?.guidanceNote, transcripts, method: dossier?.method ?? "" } },
    guidance: ev?.latestGuidance.length ? { status: "ok", data: { items: ev.latestGuidance } } : { status: dossier?.guidanceNote ? "partial" : "unavailable", note: dossier?.guidanceNote ?? narrativeNote, data: { items: [] } },
    contradictions: { status: "ok", note: flags.length ? undefined : "No mechanical red flags triggered on the available statements.", data: { items: flags } },
    bullBear,
    documents,
    warnings,
  };
}

async function buildBullBear(name: string, facts: Fact[], flags: Fact[], ev: ReturnType<typeof evaluate> | null): Promise<ResearchReport["bullBear"]> {
  const pos = facts.filter((f) => f.tone === "pos");
  const neg = [...flags, ...facts.filter((f) => f.tone === "neg")];
  if (ev) {
    for (const c of ev.credibility) (c.tone === "pos" ? pos : neg).push(c);
    neg.push(...ev.divergences);
  }
  const rules = { bull: dedupe(pos).slice(0, 4), bear: dedupe(neg).slice(0, 4) };
  if (!llmStatus().enabled || (!rules.bull.length && !rules.bear.length)) return { status: rules.bull.length || rules.bear.length ? "ok" : "unavailable", note: "Assembled by rules from the computed facts above; each point links to its number.", data: { ...rules, basis: "rules" } };

  // Reasoning tier writes the two cases, but may only cite the numbered evidence it was given.
  const evidence = [...pos, ...neg].map((f, i) => ({ id: i + 1, text: `${f.label}: ${f.value}${f.detail ? ` (${f.detail})` : ""}` }));
  const schema = z.object({ bull: z.array(z.object({ point: z.string(), evidence: z.array(z.number().int()) })).max(4), bear: z.array(z.object({ point: z.string(), evidence: z.array(z.number().int()) })).max(4) });
  try {
    const out = await llmJson("reasoning", "You write a tight bull and bear case for an equity analyst. Use ONLY the numbered evidence. Every point must cite ≥1 evidence id. No outside knowledge, no price targets. ≤22 words per point. JSON {bull:[{point,evidence}],bear:[{point,evidence}]}.", `Company: ${name}\nEvidence:\n${evidence.map((e) => `[${e.id}] ${e.text}`).join("\n")}`, schema, 900);
    const valid = (p: { evidence: number[] }) => p.evidence.length && p.evidence.every((id) => id >= 1 && id <= evidence.length);
    const map = (p: { point: string; evidence: number[] }): Fact => ({ label: p.point, value: p.evidence.map((id) => `[${id}]`).join(" "), kind: "ai", detail: p.evidence.map((id) => evidence[id - 1].text).join(" · ") });
    const bull = out.bull.filter(valid).map(map), bear = out.bear.filter(valid).map(map);
    if (bull.length + bear.length) return { status: "ok", note: "Written by the reasoning model over the evidence list only; citations validated.", data: { bull, bear, basis: "llm" } };
  } catch { /* fall back to rules */ }
  return { status: "ok", note: "Assembled by rules from the computed facts above.", data: { ...rules, basis: "rules" } };
}

function dedupe(fs: Fact[]): Fact[] {
  const seen = new Set<string>();
  return fs.filter((f) => (seen.has(f.label) ? false : (seen.add(f.label), true)));
}

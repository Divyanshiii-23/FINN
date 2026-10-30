import "server-only";
import { z } from "zod";
import type { Fact, ResearchReport } from "./types";
import { buildReport } from "./report";
import { buildBriefing } from "../pipeline/briefing";
import { llmJson, llmStatus } from "../llm";

export interface Answer {
  question: string;
  symbol: string | null;
  intent: string;
  mode: "llm" | "extractive";
  paragraphs: string[];
  citations: { n: number; label: string; url: string; detail?: string }[];
  note?: string;
}

interface Ev { text: string; label: string; url: string; detail?: string }

const INTENTS: [string, RegExp][] = [
  ["attention", /deserve|attention|watch( today)?|priorit|most important|what matters|today/i],
  ["changed", /changed between|last two (concalls|calls|quarters)|what changed|differen/i],
  ["guidance", /promis|guid|target|commit|said .* (year|fy)|outlook/i],
  ["cash", /cash|convert|conversion|fcf|free cash/i],
  ["margins", /margin|ebitda|profitab/i],
  ["debt", /debt|leverage|borrow|balance sheet/i],
];

export async function ask(question: string, symbolIn?: string | null): Promise<Answer> {
  const symbol = (symbolIn ?? detectSymbol(question))?.toUpperCase() ?? null;
  const intent = INTENTS.find(([, re]) => re.test(question))?.[0] ?? "general";

  if (!symbol || intent === "attention") {
    const b = await buildBriefing(168);
    const top = b.items.slice(0, 4);
    const ev: Ev[] = top.map((i) => ({ text: `${i.company}: ${i.headline}. ${i.whyItMatters ?? ""}`, label: `${i.company} — ${i.title.length > 80 ? i.title.slice(0, 77) + "…" : i.title}`, url: i.url, detail: `filed ${i.date}` }));
    const paragraphs = top.length
      ? [`Ranked by FINN's materiality score over the last 7 days, the top item is ${top[0].company} (${top[0].score}/100): ${lowerFirst(top[0].headline)} [1].`,
         ...top.slice(1).map((i, k) => `${k + 2}. ${i.company} (${i.score}) — ${lowerFirst(i.headline)} [${k + 2}].`),
         `Why it leads: ${top[0].reasons.filter((r) => r.delta !== 0 && r.basis !== "rule").map((r) => r.text).join("; ") || top[0].whyItMatters}.`]
      : ["Nothing in the portfolio cleared the materiality bar in the last 7 days."];
    return { question, symbol: null, intent: "attention", mode: "extractive", paragraphs, citations: ev.map((e, k) => ({ n: k + 1, label: e.label, url: e.url, detail: e.detail })) };
  }

  const r = await buildReport(symbol);
  if (!r) return { question, symbol, intent, mode: "extractive", paragraphs: [`I couldn't find ${symbol}. Check the NSE symbol (e.g. INFY, HDFCBANK).`], citations: [] };
  const ev = evidenceFor(r, intent);

  if (llmStatus().enabled && ev.length) {
    try {
      const schema = z.object({ paragraphs: z.array(z.string()).min(1).max(4) });
      const out = await llmJson("reasoning",
        "You are FINN, an equity research assistant. Answer ONLY from the numbered evidence (primary company disclosures and FINN's computed metrics). Cite like [n] after every claim. If the evidence is insufficient, say exactly what is missing. No outside knowledge, no recommendations. ≤120 words. JSON {paragraphs:[...]}.",
        `Company: ${r.name} (${r.symbol})\nQuestion: ${question}\n\nEvidence:\n${ev.map((e, i) => `[${i + 1}] ${e.text}`).join("\n")}`, schema, 700);
      const cited = new Set([...out.paragraphs.join(" ").matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      if ([...cited].every((n) => n >= 1 && n <= ev.length) && cited.size)
        return { question, symbol, intent, mode: "llm", paragraphs: out.paragraphs, citations: ev.map((e, i) => ({ n: i + 1, label: e.label, url: e.url, detail: e.detail })) };
    } catch { /* extractive fallback */ }
  }
  return { question, symbol, intent, mode: "extractive", paragraphs: extractive(r, intent, ev), citations: ev.map((e, i) => ({ n: i + 1, label: e.label, url: e.url, detail: e.detail })),
    note: llmStatus().enabled ? undefined : "Extractive mode: assembled from FINN's computed facts and cited disclosures (no LLM key configured)." };
}

function evidenceFor(r: ResearchReport, intent: string): Ev[] {
  const f2e = (f: Fact): Ev => ({ text: `${f.label}${f.value ? ": " + f.value : ""}${f.period ? ` (${f.period})` : ""}${f.detail ? ` — ${f.detail}` : ""}`, label: f.source?.title ?? `FINN calc — ${f.label}`, url: f.source?.url ?? r.provenance.fundamentals.url ?? "#", detail: f.source?.loc });
  const tracks = r.narrative.data.tracks;
  const trackEv = tracks.flatMap((t) => [
    { text: `${t.fy} ${t.label}: ${t.revision.text} ${t.verdict.text}`, label: t.points[t.points.length - 1].source.title, url: t.points[t.points.length - 1].source.url, detail: t.points[t.points.length - 1].source.loc },
    ...t.derivations.map(f2e),
  ]);
  switch (intent) {
    case "guidance": return [...trackEv, ...r.narrative.data.credibility.map(f2e)].slice(0, 10);
    case "changed": {
      const periods = [...new Set(r.narrative.data.commentary.map((c) => c.label))].slice(-2);
      const pts = tracks.flatMap((t) => t.points.filter((p) => periods.includes(p.givenIn)).map((p) => ({ text: `${p.givenIn}: ${t.fy} ${t.label} — ${p.low == null ? (p.statement ?? "qualitative") : `guided ${p.low}–${p.high}${t.unit === "%" ? "%" : " " + t.unit}`}. Since then: ${t.verdict.text}`, label: p.source.title, url: p.source.url, detail: p.source.loc })));
      return [...pts, ...r.narrative.data.commentary.filter((c) => periods.includes(c.label)).map((c) => ({ text: `${c.label} (${c.theme}): ${c.value}`, label: c.source?.title ?? c.label, url: c.source?.url ?? "#", detail: c.source?.loc }))];
    }
    case "cash": return [...r.cash.data.facts, ...r.contradictions.data.items.filter((f) => /cash|profit/i.test(f.label))].map(f2e);
    case "margins": return [...r.trajectory.data.facts.filter((f) => /margin/i.test(f.label)), ...r.snapshot.data.facts.filter((f) => /margin/i.test(f.label)), ...r.contradictions.data.items.filter((f) => /margin|income/i.test(f.label)), ...r.narrative.data.commentary.filter((c) => /margin/i.test(c.theme + c.value))].map(f2e);
    case "debt": return [...r.balanceSheet.data.facts, ...r.contradictions.data.items.filter((f) => /debt|interest/i.test(f.label))].map(f2e);
    default: return [...r.snapshot.data.facts, ...r.narrative.data.credibility, ...r.narrative.data.divergences, ...r.contradictions.data.items].map(f2e).slice(0, 10);
  }
}

function extractive(r: ResearchReport, intent: string, ev: Ev[]): string[] {
  if (!ev.length) {
    if (["guidance", "changed"].includes(intent)) return [r.narrative.note ?? r.narrative.data.guidanceNote ?? `No management guidance on file for ${r.name}.`];
    if (intent === "cash") return [r.cash.note ?? "Cash-flow statement unavailable."];
    return [`Not enough evidence on file for ${r.name} to answer that.`];
  }
  const lead: Record<string, string> = {
    guidance: `What ${r.name} guided, and what it delivered:`,
    changed: `Between the last two calls on file:`,
    cash: `Do ${r.name}'s profits turn into cash?`,
    margins: `${r.name} margins:`,
    debt: `${r.name} balance sheet:`,
    general: `${r.name} — key facts on file:`,
  };
  return [lead[intent] ?? lead.general, ...ev.slice(0, 6).map((e, i) => `${e.text} [${i + 1}]`)];
}

const KNOWN: Record<string, string> = { infosys: "INFY", infy: "INFY", reliance: "RELIANCE", ril: "RELIANCE", "hdfc bank": "HDFCBANK", hdfc: "HDFCBANK", airtel: "BHARTIARTL", bharti: "BHARTIARTL", itc: "ITC", "l&t": "LT", larsen: "LT", "sun pharma": "SUNPHARMA", "tata steel": "TATASTEEL", eternal: "ETERNAL", zomato: "ETERNAL", bel: "BEL", "bharat electronics": "BEL", ntpc: "NTPC", titan: "TITAN", "asian paints": "ASIANPAINT", dixon: "DIXON", polycab: "POLYCAB", "bajaj finance": "BAJFINANCE", bajfinance: "BAJFINANCE" };
function detectSymbol(q: string): string | null {
  const t = q.toLowerCase();
  for (const [k, v] of Object.entries(KNOWN)) if (new RegExp(`\\b${k.replace(/[&]/g, "\\&")}\\b`).test(t)) return v;
  const m = q.match(/\b[A-Z]{3,12}\b/);
  return m ? m[0] : null;
}
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

import "server-only";
import { z } from "zod";
import type { CompanyData } from "../types";
import type { Dossier } from "./narrative";
import { llmJson, llmStatus } from "../llm";
import { getBytes } from "../sources/http";
import { fiscalLabel, parseQuarterLabel, quarterReportedOn, shiftQuarter } from "../finance/quarters";
import { pctChange, ratio } from "../finance/change";

const Extract = z.object({
  guidance: z.array(z.object({
    metric: z.string(), label: z.string(), fy: z.string(),
    low: z.number().nullable(), high: z.number().nullable(), unit: z.string(),
    type: z.enum(["explicit", "qualitative"]), quote: z.string(), page: z.number().int(),
  })).max(12),
  commentary: z.array(z.object({
    theme: z.string(), tone: z.enum(["positive", "neutral", "cautious", "negative"]), text: z.string(), quote: z.string(), page: z.number().int(),
  })).max(6),
});

const SYSTEM = `You extract management guidance from ONE Indian listed company's earnings-call transcript.
Rules:
- Use ONLY the transcript text provided. Never use outside knowledge of the company.
- "explicit" guidance = a forward-looking number or numeric range stated by management (growth %, margin %, capex amount, volume). "qualitative" = forward-looking direction without a number.
- Never invent or infer a number. If management gave no number, type must be "qualitative" and low/high null.
- Analyst questions are not guidance. Past results are not guidance.
- quote: copy 8–30 words VERBATIM from the page it came from. page: the [p.N] marker of that page.
- fy: fiscal year the guidance refers to, as "FY27" style. metric: one of revenue_growth, ebitda_margin, pat_growth, capex, volume_growth, order_inflow, other.
- commentary: up to 6 short paraphrases of what management emphasised (themes: Growth, Margins, Demand, Capex, Balance sheet, Risks), each with a supporting verbatim quote.
Return JSON {"guidance":[...],"commentary":[...]} only.`;

const KEYWORDS = /guid|outlook|expect|target|aspire|we see|going forward|next (year|quarter)|fy\s?'?\d{2}|margin|growth|capex|bps|basis points|double[- ]digit|\d+\s?(%|percent)/gi;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").trim();

async function transcriptPages(url: string): Promise<string[]> {
  const bytes = await getBytes(url, "transcript PDF", { timeoutMs: 15000, revalidate: 7 * 86400, headers: { Referer: "https://www.bseindia.com/" } });
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

/** Chunk → retrieve → extract → verify. Only guidance-dense pages reach the model (cost), and every quote must be found in its page (faithfulness). */
export async function liveDossier(c: CompanyData): Promise<{ dossier: Dossier | null; warnings: string[] }> {
  const warnings: string[] = [];
  if (!llmStatus().enabled) return { dossier: null, warnings: ["Transcript extraction is off: no LLM key configured (GEMINI_API_KEY enables it on the free tier)."] };
  const calls = c.concalls.filter((x) => x.transcript).slice(0, 4);
  if (!calls.length) return { dossier: null, warnings: ["No earnings-call transcripts are linked for this company."] };

  const d: Dossier = { symbol: c.symbol, preparedAt: new Date().toISOString(), method: "Live: transcripts fetched from the exchange/IR link, guidance-dense pages selected by keyword density, extracted by the fast model, quotes verified verbatim against the page text.", documents: {}, business: { summary: "", segments: [], evidence: [] }, guidance: [], actuals: [], kpis: [], commentary: [] };
  let dropped = 0;

  await Promise.all(calls.map(async (call) => {
    const id = `cc_${call.period.replace(/\s/g, "").toLowerCase()}`;
    const reported = quarterReportedOn(monthToDate(call.period));
    const givenIn = fiscalLabel(reported);
    d.documents[id] = { title: `${givenIn} earnings-call transcript`, date: monthToIso(call.period), period: givenIn, type: "transcript", url: call.transcript! };
    let pages: string[];
    try { pages = await transcriptPages(call.transcript!); } catch (e) { warnings.push(`${givenIn} transcript unreadable (${(e as Error).message})`); return; }
    const ranked = pages.map((t, i) => ({ i, t, s: (t.match(KEYWORDS) ?? []).length })).sort((a, b) => b.s - a.s).slice(0, 5).sort((a, b) => a.i - b.i);
    const body = ranked.map((p) => `[p.${p.i + 1}]\n${p.t.slice(0, 3500)}`).join("\n\n");
    try {
      const out = await llmJson("fast", SYSTEM, `Company: ${c.name} (${c.symbol}). Call: ${givenIn}.\n\n${body}`, Extract);
      const found = (quote: string, page: number) => {
        const q = norm(quote);
        if (q.length < 12) return null;
        if (pages[page - 1] && norm(pages[page - 1]).includes(q)) return page;
        const any = pages.findIndex((p) => norm(p).includes(q));
        return any >= 0 ? any + 1 : null;
      };
      for (const g of out.guidance) {
        const page = found(g.quote, g.page);
        if (!page) { dropped++; continue; }
        const explicit = g.type === "explicit" && (g.low != null || g.high != null);
        d.guidance.push({ id: `${id}-${d.guidance.length}`, fy: g.fy.toUpperCase().replace(/^FY\s?20/, "FY"), metric: g.metric, label: g.label, low: explicit ? g.low ?? g.high : null, high: explicit ? g.high ?? g.low : null, unit: g.unit || "%", givenIn, date: monthToIso(call.period), type: explicit ? "explicit" : "qualitative", doc: id, loc: `p.${page}`, statement: `“${g.quote}”` });
      }
      for (const m of out.commentary) {
        const page = found(m.quote, m.page);
        if (!page) { dropped++; continue; }
        d.commentary.push({ period: givenIn, theme: m.theme, tone: m.tone, text: m.text, doc: id, loc: `p.${page}` });
      }
    } catch (e) { warnings.push(`${givenIn}: extraction failed (${(e as Error).message})`); }
  }));
  if (dropped) warnings.push(`${dropped} extracted statement(s) discarded — quote not found verbatim in the transcript.`);

  // Actuals from the standardised quarterly table (INR basis — disclosed against any cc guidance).
  const h = c.quarters.headers, rows = c.quarters.rows;
  const rev = rows.Sales ?? rows.Revenue, op = rows["Operating Profit"];
  d.documents.screener = { title: "Standardised quarterly results (screener.in, from exchange filings)", date: new Date().toISOString().slice(0, 7), period: "quarterly", type: "financials", url: c.provenance.fundamentals.url ?? "https://www.screener.in" };
  h.forEach((label, i) => {
    const prev = shiftQuarter(label, -4); const j = prev ? h.indexOf(prev) : -1;
    if (rev && j >= 0) { const ch = pctChange(rev[i], rev[j]); if (ch.pct != null) d.actuals.push({ metric: "revenue_growth", scope: "quarter_yoy", period: fiscalLabel(label), value: ch.pct, unit: "%", doc: "screener", loc: `${label} vs ${prev}`, note: "INR reported; guidance may be in constant currency" }); }
    if (rev && op && c.kind === "corporate") { const m = ratio(op[i], rev[i]); if (m != null) d.actuals.push({ metric: "ebitda_margin", scope: "quarter", period: fiscalLabel(label), value: Math.round(m * 10) / 10, unit: "%", doc: "screener", loc: label }); }
  });
  void parseQuarterLabel;
  return { dossier: d.guidance.length || d.commentary.length ? d : null, warnings };
}

const MON: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function monthToIso(period: string) { const [m, y] = period.split(" "); return `${y}-${String(MON[m] ?? 1).padStart(2, "0")}`; }
function monthToDate(period: string) { return `${monthToIso(period)}-15`; }

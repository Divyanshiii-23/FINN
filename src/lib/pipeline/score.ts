import type { CompanyData, FeedItem, ManagementChange, Reason, ResultsTable, Tier } from "../types";
import { fmtSigned } from "../finance/change";
import { fiscalLabel, quarterReportedOn, ttm } from "../finance/quarters";
import { buildResultsTable } from "../finance/results";
import type { Classification } from "./classify";
import { fxAmount, inrAmountCr, namesFrom, roleFrom } from "./extract";
import enrichment from "../../../data/enrichment/management.json";
import { fmtCr } from "../format";

/** Base materiality by category/subtype — the prior before evidence. Tuned so that routine paperwork can never clear the alert bar. */
const BASE: Record<string, number> = {
  "results/filing": 62, "results/outcome": 62, "results/press_release": 58, "results/letter": 58, "results/presentation": 35,
  "results/intimation": 14, "results/postponed": 48, "results/newspaper": 4,
  "management_change/appointment": 55, "management_change/change": 60, "management_change/departure": 60, "management_change/reappointment": 18,
  "M&A/deal": 55, "M&A/subsidiary": 45, "M&A/scheme": 40, "M&A/strike_off": 10,
  "fund_raise/equity": 60, "fund_raise/debt": 35, "fund_raise/buyback": 60, "fund_raise/repayment": 10,
  "litigation/insolvency": 62, "litigation/order": 45, "litigation/penalty": 40,
  "credit_rating/downgrade": 75, "credit_rating/upgrade": 50, "credit_rating/reaffirm": 15, "credit_rating/rating": 30,
  "earnings_call/transcript": 34, "earnings_call/recording": 12, "earnings_call/intimation": 10,
  "investor_meetings/intimation": 6, "investor_meetings/outcome": 12,
  "insider_trading/disclosure": 30, "pledging/pledge": 60, "bonus_split/bonus_split": 55, "dividend/dividend": 28,
  "capex/approval": 50, "capex/commissioning": 28, "press_release/order_win": 38, "press_release/regulatory_approval": 45, "press_release/update": 18,
  "postal_ballot/notice": 6, "agm_egm/meeting": 12, "unclassified/routine": 3, "unclassified/guarantee": 20, "unclassified/other": 10,
};

export function tierOf(score: number): Tier {
  return score >= 72 ? "high" : score >= 45 ? "medium" : score >= 25 ? "low" : "routine";
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

interface EnrichmentEntry { role: string; incoming: string; outgoing: string; effective: string; summary: string; points: string[]; preannounced?: boolean; sources: { label: string; url: string }[] }

export function scoreAnnouncement(
  c: CompanyData,
  a: { date: string; time?: string; title: string; url: string; summary?: string },
  cls: Classification,
): Omit<FeedItem, "related"> {
  const key = `${cls.category}/${cls.subtype}`;
  const base = BASE[key] ?? BASE[`${cls.category}/update`] ?? 20;
  const reasons: Reason[] = [{ text: `${labelFor(cls)} — base priority`, delta: base, basis: "rule" }];
  const text = `${a.title} ${a.summary ?? ""}`;
  const revenueTTM = ttm(c.quarters.rows.Sales ?? c.quarters.rows.Revenue);
  const amountCr = inrAmountCr(text);
  let headline = a.title;
  let whatHappened = a.title.replace(/^announcement under regulation 30 \(lodr\)-/i, "");
  let whyItMatters: string | null = null;
  let watch: string | null = null;
  let results: FeedItem["results"];
  let management: ManagementChange | undefined;
  const add = (text: string, delta: number, basis: Reason["basis"] = "computed") => reasons.push({ text, delta, basis });

  // ---------------------------------------------------------------- results
  if (cls.category === "results" && ["filing", "outcome", "press_release", "letter", "presentation"].includes(cls.subtype)) {
    const q = quarterReportedOn(a.date);
    const table = buildResultsTable(c, q);
    if (table && table.rows.find((r) => r.metric === "PAT")?.current != null) {
      results = table;
      const pat = table.rows.find((r) => r.metric === "PAT")!;
      const rev = table.rows.find((r) => r.metric === "Revenue")!;
      const patY = pat.yoyChange, revY = rev.yoyChange;
      if (patY.direction === "na" && patY.display !== "—") add(`PAT ${patY.display.toLowerCase()} YoY`, 18);
      else if (patY.pct != null) {
        const m = Math.abs(patY.pct);
        if (m >= 25) add(`PAT ${patY.display} YoY — large move`, 16);
        else if (m >= 10) add(`PAT ${patY.display} YoY`, 8);
        else add(`PAT ${patY.display} YoY — in line with trend`, 0);
      }
      if (revY.pct != null && revY.pct <= -5) add(`Revenue ${revY.display} YoY — top-line decline`, 8);
      else if (revY.pct != null && revY.pct >= 20) add(`Revenue ${revY.display} YoY`, 5);
      if (table.margin?.yoyBps != null && Math.abs(table.margin.yoyBps) >= 150)
        add(`${table.margin.label} ${table.margin.yoyBps > 0 ? "+" : "−"}${Math.abs(table.margin.yoyBps)} bps YoY`, 7);
      // other-income dependence
      const oi = c.quarters.rows["Other Income"], pbtRow = c.quarters.rows["Profit before tax"];
      const qi = c.quarters.headers.indexOf(q);
      if (oi && pbtRow && qi >= 0 && pbtRow[qi] && (oi[qi] ?? 0) / (pbtRow[qi] as number) >= 0.3 && c.kind === "corporate")
        add(`Other income is ${Math.round(((oi[qi] as number) / (pbtRow[qi] as number)) * 100)}% of PBT — earnings quality check`, 5);
      if (cls.subtype === "presentation") add("Results deck — the filing itself carries the numbers", -10, "rule");
      headline = resultsHeadline(q, table);
      whatHappened = `${c.name} reported ${fiscalLabel(q)} (${q} quarter) results.`;
      whyItMatters = resultsWhy(table, c);
      watch = c.concalls.length ? "Earnings-call transcript usually follows within a week — FINN will check guidance against these numbers." : null;
    } else {
      results = { pending: true, quarter: q, note: `Standardised ${q} figures not yet available — open the filing, or run live mode to extract them from the PDF.`, claim: amountCr ? undefined : undefined };
      const claimMatch = a.title.match(/(record [^;]*?(?:pat|profit)[^;]*?₹\s?[\d,]+\s*crore)/i);
      if (claimMatch) results.claim = claimMatch[1];
      add(`${fiscalLabel(q)} numbers pending extraction`, 0, "rule");
      headline = `${fiscalLabel(q)} results filed`;
      whatHappened = `${c.name} filed ${fiscalLabel(q)} results on ${fmtDay(a.date)}.`;
      whyItMatters = results.claim ? `Company headline (not yet verified against the statement): ${results.claim}.` : "Quarterly results are the highest-signal routine disclosure; numbers will populate once extracted.";
    }
  }

  if (cls.category === "results" && cls.subtype === "postponed") {
    headline = "Results board meeting postponed";
    whyItMatters = "A moved results date is worth a look — the filing states the reason. FINN tracks the new date in Coming up.";
  }
  if (cls.category === "results" && cls.subtype === "intimation") headline = "Results date set";

  // ---------------------------------------------------------------- management
  if (cls.category === "management_change") {
    const role = roleFrom(text);
    const names = namesFrom(a.title);
    management = { role: role.role, seniority: role.seniority, ...names };
    if (role.seniority === "top" && cls.subtype !== "reappointment") add(`${role.role} — top-of-house role`, 25, "filing");
    else if (role.seniority === "board") add("Board-level change (non-executive / nominee seats rotate routinely)", -20, "filing");
    else add(`${role.role} — functional role`, -25, "filing");
    const enr = (enrichment as unknown as Record<string, EnrichmentEntry>)[`${c.symbol}:${a.date}`];
    if (enr) {
      management = { role: enr.role, seniority: "top", incoming: enr.incoming, outgoing: enr.outgoing, effective: enr.effective,
        profile: { summary: enr.summary, points: enr.points, sources: enr.sources, basis: "enrichment" } };
      if (enr.preannounced) add("Succession was pre-announced — lowers surprise", -10, "enrichment");
    }
    if (management.incoming) {
      headline = `${management.role}: ${management.incoming}${management.outgoing ? ` succeeds ${management.outgoing}` : " appointed"}`;
      whyItMatters = `Change at the top of ${c.name}. ${management.profile?.summary ?? "Profile is disclosed in the filing (Reg. 30 requires a brief profile)."} Watch the first earnings call under new leadership for any shift in strategy or guidance.`;
    } else if (role.seniority === "kmp") {
      headline = `${role.role} — ${cls.subtype === "reappointment" ? "re-appointment" : "change"}`;
      whyItMatters = null;
    } else {
      headline = `${role.role} change`;
      whyItMatters = "The filing names the person and carries the Reg. 30 profile; open it for who is joining or leaving.";
    }
  }

  // ---------------------------------------------------------------- amounts vs scale
  if (amountCr != null && revenueTTM) {
    const pctRev = (amountCr / revenueTTM) * 100;
    if (cls.category === "press_release" && cls.subtype === "order_win") {
      add(`Orders ≈ ${pctRev.toFixed(1)}% of TTM revenue (₹${fmtCr(amountCr)} cr vs ₹${fmtCr(revenueTTM)} cr)`, pctRev >= 5 ? 25 : pctRev >= 2 ? 10 : -10);
      headline = `Orders worth ₹${fmtCr(amountCr)} cr`;
      whyItMatters = `Equivalent to ${pctRev.toFixed(1)}% of trailing-twelve-month revenue — ${pctRev >= 5 ? "a meaningful addition to the order book" : "incremental rather than thesis-changing"}.`;
    }
    if (cls.category === "litigation" && cls.subtype === "penalty") {
      add(`Penalty ₹${amountCr < 1 ? (amountCr * 100).toFixed(2) + " lakh" : fmtCr(amountCr) + " cr"} = ${pctRev < 0.01 ? "<0.01" : pctRev.toFixed(2)}% of TTM revenue — immaterial`, pctRev < 0.1 ? -30 : 10);
      headline = "Regulatory penalty";
      whyItMatters = pctRev < 0.1 ? "Financially immaterial; relevant only if it signals a pattern of compliance issues." : "Material relative to revenue — read the order.";
    }
    if (cls.category === "fund_raise" && cls.subtype === "debt") {
      const bs = c.annual?.bs.Borrowings;
      const borrowings = bs ? bs[bs.length - 1] : null;
      const label = c.annual?.headers[c.annual.headers.length - 1];
      if (borrowings) {
        const x = amountCr / borrowings;
        if (c.kind !== "corporate") add(`Debt issuance is routine funding for a lender (${(x * 100).toFixed(1)}% of borrowings)`, -25);
        else if (x >= 0.5) add(`₹${fmtCr(amountCr)} cr ≈ ${x.toFixed(1)}× borrowings at ${label} (₹${fmtCr(borrowings)} cr) — step-up in leverage`, 25);
        else add(`₹${fmtCr(amountCr)} cr ≈ ${(x * 100).toFixed(0)}% of borrowings at ${label}`, x >= 0.2 ? 8 : -10);
        headline = `₹${fmtCr(amountCr)} cr debt raised`;
        whyItMatters = c.kind !== "corporate" ? "Business-as-usual liability management for a lender." : x >= 0.5 ? `Large relative to the existing debt of ₹${fmtCr(borrowings)} cr — check use of proceeds (capex, acquisition or refinancing) in the filing.` : null;
      } else add(`₹${fmtCr(amountCr)} cr ≈ ${pctRev.toFixed(1)}% of TTM revenue`, pctRev >= 10 ? 10 : -5);
    }
    if (cls.category === "M&A" && pctRev < 0.1) { add(`Deal value ₹${fmtCr(amountCr)} cr is immaterial vs revenue`, -30); }
  }
  const fx = fxAmount(text);
  if (cls.category === "M&A" && fx && fx.value < 1e6) {
    add(`${fx.currency} ${fx.value.toLocaleString("en-IN")} — immaterial (entity set-up)`, -35);
    headline = "New subsidiary incorporated";
    whyItMatters = "Administrative step (small capital); relevant only as a signal of geographic expansion.";
  }

  // ---------------------------------------------------------------- category-specific notes
  if (cls.category === "litigation" && cls.subtype === "insolvency") {
    if (/set aside|allowed .*appeal|quash|stay/i.test(text)) add("Appellate outcome in the company's favour", 6, "filing");
    if (/delist|index|msci/i.test(text)) add("Index-membership implications (passive flows)", 10, "filing");
    headline = /set aside|allowed/i.test(text) ? "Insolvency matter: NCLAT rules for the company" : "Insolvency proceeding update";
    whyItMatters = "Insolvency-process filings against an operating company are rare and can drive index decisions and flows; read the order for whether the underlying admission is fully quashed.";
  }
  if (cls.category === "earnings_call" && cls.subtype === "transcript") {
    headline = "Earnings-call transcript filed";
    whyItMatters = "Primary source for guidance and tone — feeds Research › Narrative vs Numbers.";
  }
  if (cls.category === "M&A" && cls.subtype === "strike_off") headline = "Dormant subsidiary struck off";
  if (cls.category === "M&A" && cls.subtype === "scheme") { headline = "Scheme of arrangement — tribunal step"; whyItMatters = "Procedural milestone in a scheme already announced; economics were disclosed when the scheme was approved."; }
  if (cls.category === "capex" && cls.subtype === "commissioning") { const mw = text.match(/(\d[\d,.]*\s*MW(?:\s*\/\s*\d[\d,.]*\s*MWh)?)(?:\s+(?:of\s+)?([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3}))?/); headline = mw ? `Commissioned: ${mw[1]}${mw[2] ? " " + mw[2] : ""}` : "Capacity commissioned"; whyItMatters = "Execution progress on announced capacity — supports volume growth; individually small."; }
  if (cls.category === "press_release" && cls.subtype === "regulatory_approval") { headline = condense(a.title); whyItMatters = "New approvals expand the addressable market for an existing product; size depends on the indication."; }
  if (cls.category === "dividend") { const d = text.match(/(?:rs\.?|₹)\s*([\d.]+)\s*(?:per share)?\s*(interim|final|special)?/i); headline = d ? `${d[2] ? d[2][0].toUpperCase() + d[2].slice(1) + " dividend" : "Dividend"} ₹${d[1]}/share` : "Dividend declared"; }
  if (cls.category === "press_release" && cls.subtype === "update") headline = condense(a.title);
  if (cls.category === "M&A" && cls.subtype === "deal") headline = condense(a.title);
  if (cls.category === "insider_trading") headline = "Substantial-holder disclosure";

  const score = clamp(reasons.reduce((s, r) => s + r.delta, 0));
  return {
    id: hash(`${c.symbol}|${a.url}|${a.title}`),
    symbol: c.symbol, company: c.name, sector: c.sector,
    category: cls.category, title: a.title, date: a.date, time: a.time, url: a.url,
    score, tier: tierOf(score), reasons, headline, whatHappened, whyItMatters, watch,
    interpretation: "rules", results, management, amountCr,
    provenance: c.provenance.announcements,
  };
}

/** Strip regulatory boilerplate so the filing's own words can serve as the headline. */
export function condense(title: string): string {
  const t = title.replace(/^(announcement under regulation 30 \(lodr\)-?|reg(ulation)? 30 \(lodr\)\s*-?\s*|disclosure under regulation 30\s*-?\s*|press release:?\s*-?\s*|intimation:?\s*)/i, "").trim();
  return t.length > 96 ? t.slice(0, 93).replace(/\s+\S*$/, "") + "…" : t;
}

function labelFor(cls: Classification): string {
  const map: Record<string, string> = {
    "results/filing": "Quarterly results filing", "results/outcome": "Board outcome with results", "results/press_release": "Results press release",
    "results/letter": "Shareholder letter with results", "results/presentation": "Results presentation", "results/intimation": "Results date intimation",
    "results/postponed": "Results meeting postponed", "results/newspaper": "Newspaper notice of results",
  };
  return map[`${cls.category}/${cls.subtype}`] ?? `${cls.category.replace("_", " ")} · ${cls.subtype.replace("_", " ")}`;
}

function resultsHeadline(q: string, t: ResultsTable): string {
  const pat = t.rows.find((r) => r.metric === "PAT")!;
  const rev = t.rows.find((r) => r.metric === "Revenue")!;
  const parts = [`${fiscalLabel(q)}: PAT ${pat.yoyChange.display} YoY`, `revenue ${rev.yoyChange.display}`];
  if (t.margin?.yoyBps != null && t.margin.label === "EBITDA margin") parts.push(`margin ${t.margin.yoyBps >= 0 ? "+" : "−"}${Math.abs(t.margin.yoyBps)} bps`);
  return parts.join(", ");
}

function resultsWhy(t: ResultsTable, c: CompanyData): string {
  const pat = t.rows.find((r) => r.metric === "PAT")!;
  const rev = t.rows.find((r) => r.metric === "Revenue")!;
  const ebitda = t.rows.find((r) => r.metric === "EBITDA");
  const notes: string[] = [];
  if (pat.yoyChange.pct != null && rev.yoyChange.pct != null) {
    const gap = pat.yoyChange.pct - rev.yoyChange.pct;
    if (gap >= 8) notes.push(`Profit grew faster than revenue (${pat.yoyChange.display} vs ${rev.yoyChange.display}) — operating leverage or below-the-line help`);
    else if (gap <= -8) notes.push(`Profit lagged revenue (${pat.yoyChange.display} vs ${rev.yoyChange.display}) — margin or cost pressure`);
    else notes.push(`Profit tracked revenue (${pat.yoyChange.display} vs ${rev.yoyChange.display})`);
  }
  if (ebitda && !ebitda.notMeaningful && t.margin?.yoyBps != null && Math.abs(t.margin.yoyBps) >= 100)
    notes.push(`EBITDA margin ${t.margin.yoyBps > 0 ? "expanded" : "compressed"} ${Math.abs(t.margin.yoyBps)} bps YoY to ${t.margin.current?.toFixed(1)}%`);
  const oi = c.quarters.rows["Other Income"], pbt = c.quarters.rows["Profit before tax"];
  const qi = c.quarters.headers.indexOf(t.quarter);
  if (c.kind === "corporate" && oi && pbt && qi >= 0 && pbt[qi]) {
    const share = ((oi[qi] ?? 0) / (pbt[qi] as number)) * 100;
    if (share >= 30) notes.push(`other income is ${share.toFixed(0)}% of PBT, so core operations explain less of the profit than the headline suggests`);
  }
  if (pat.qoq.pct != null && Math.abs(pat.qoq.pct) >= 15) notes.push(`sequentially PAT ${pat.qoq.display}`);
  return notes.length ? notes.join("; ") + "." : "Numbers in line with recent trend.";
}

export function fmtDay(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export { fmtSigned };

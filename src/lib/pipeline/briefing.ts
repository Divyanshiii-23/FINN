import "server-only";
import type { Briefing, CompanyData, FeedItem, Holding, MarketAlert, Provenance, Tier, UpcomingEvent } from "../types";
import { classify } from "./classify";
import { datesIn } from "./extract";
import { fmtDay, scoreAnnouncement, tierOf } from "./score";
import { getCompany, SNAPSHOT_CAPTURED_AT } from "../sources";
import { PORTFOLIO } from "../portfolio";
import { DEFAULT_RULES, lastDayMove, volumeMultiple } from "../finance/anomaly";
import { buildResultsTable } from "../finance/results";
import { fiscalLabel, parseQuarterLabel } from "../finance/quarters";
import { ratio } from "../finance/change";

const TIER_RANK: Record<Tier, number> = { high: 0, medium: 1, low: 2, routine: 3 };
const LEAD_RESULTS = new Set(["filing", "outcome", "press_release", "letter"]);

export function processCompany(c: CompanyData): FeedItem[] {
  const scored = c.announcements.map((a) => {
    const cls = classify(a.title, a.sourceCategory);
    return { item: { ...scoreAnnouncement(c, a, cls), related: [] } as FeedItem, cls };
  });

  // Results-day clustering: board outcome, press release, deck, newspaper notice, dividend and call notices
  // that arrive within 4 days of a results filing collapse into one card.
  const leads = scored.filter((s) => s.cls.category === "results" && LEAD_RESULTS.has(s.cls.subtype));
  const absorbed = new Set<string>();
  for (const lead of leads.sort((a, b) => b.item.score - a.item.score)) {
    if (absorbed.has(lead.item.id)) continue;
    const d0 = Date.parse(lead.item.date);
    for (const s of scored) {
      if (s === lead || absorbed.has(s.item.id)) continue;
      const near = Math.abs(Date.parse(s.item.date) - d0) <= 4 * 86400e3;
      const sameCycle = s.cls.category === "results" && s.cls.subtype !== "postponed" && s.cls.subtype !== "intimation"
        || (s.cls.category === "dividend") || (s.cls.category === "earnings_call" && s.cls.subtype !== "transcript");
      if (near && sameCycle) {
        lead.item.related.push({ title: s.item.title, url: s.item.url, date: s.item.date, category: s.item.category });
        absorbed.add(s.item.id);
        if (s.cls.category === "dividend" && !lead.item.reasons.some((r) => r.text.startsWith("Dividend"))) lead.item.reasons.push({ text: "Dividend declared alongside results", delta: 0, basis: "filing" });
      }
    }
    // A results filing whose numbers are pending inherits the company's headline claim from a same-cycle press release.
    const r = lead.item.results;
    if (r && "pending" in r && !r.claim) {
      const src = lead.item.related.map((x) => x.title).find((t) => /record .*?(pat|profit).*?₹\s?[\d,]+\s*crore/i.test(t));
      const m = src?.match(/(record [^;]*?(?:pat|profit)[^;]*?₹\s?[\d,]+\s*crore)/i);
      if (m) {
        r.claim = m[1];
        lead.item.whyItMatters = `Company headline (unverified against the statement): ${m[1]}. Numbers populate once the filing is parsed.`;
        lead.item.reasons.push({ text: "Company headline claims a record quarter — verify against the statement", delta: 5, basis: "filing" });
        lead.item.score = Math.min(100, lead.item.score + 5);
      }
    }
    if (lead.item.related.length) lead.item.reasons.push({ text: `${lead.item.related.length} same-cycle filing${lead.item.related.length > 1 ? "s" : ""} folded into this card`, delta: 0, basis: "rule" });
  }

  // Threads: successive filings on the same matter (litigation, leadership, schemes) within 4 days → one card led by the latest.
  const THREADED = new Set(["litigation/insolvency", "litigation/order", "management_change/change", "management_change/appointment", "management_change/departure", "M&A/scheme"]);
  const byThread = new Map<string, typeof scored>();
  for (const s of scored) {
    if (absorbed.has(s.item.id)) continue;
    const k = `${s.cls.category}/${s.cls.subtype}`;
    if (!THREADED.has(k)) continue;
    byThread.set(k, [...(byThread.get(k) ?? []), s]);
  }
  for (const group of byThread.values()) {
    group.sort((a, b) => b.item.date.localeCompare(a.item.date));
    const lead = group[0];
    for (const s of group.slice(1)) {
      if (Date.parse(lead.item.date) - Date.parse(s.item.date) > 4 * 86400e3) continue;
      lead.item.related.push({ title: s.item.title, url: s.item.url, date: s.item.date, category: s.item.category });
      for (const r of s.item.reasons) if (r.basis !== "rule" && !lead.item.reasons.some((x) => x.text === r.text)) { lead.item.reasons.push(r); }
      absorbed.add(s.item.id);
    }
    if (lead.item.related.length) {
      lead.item.score = Math.max(...group.filter((g) => g === lead || absorbed.has(g.item.id)).map((g) => g.item.score), Math.min(100, lead.item.reasons.reduce((t, r) => t + r.delta, 0)));
      lead.item.tier = tierOf(lead.item.score);
      lead.item.reasons.push({ text: `Latest in a thread of ${lead.item.related.length + 1} filings on this matter`, delta: 0, basis: "rule" });
    }
  }

  // exact-duplicate titles (exchanges re-disseminate)
  const seenTitle = new Set<string>();
  return scored.map((s) => s.item).filter((i) => {
    if (absorbed.has(i.id)) return false;
    const k = i.title.toLowerCase();
    if (seenTitle.has(k)) return false;
    seenTitle.add(k);
    return true;
  });
}

export function inWindow(item: { date: string; time?: string }, ref: Date, hours: number): boolean {
  const cutoff = new Date(ref.getTime() - hours * 3600e3);
  if (item.time) return Date.parse(`${item.date}T${item.time}:00+05:30`) >= cutoff.getTime() && Date.parse(item.date) <= ref.getTime() + 864e5;
  // date-only items: include the cutoff day (date-level precision is disclosed in the UI)
  const cutoffDay = new Date(cutoff.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  return item.date >= cutoffDay;
}

export function upcomingFrom(c: CompanyData, ref: Date): UpcomingEvent[] {
  const refDay = new Date(ref.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const horizon = new Date(ref.getTime() + 21 * 864e5).toISOString().slice(0, 10);
  const out: UpcomingEvent[] = [];
  for (const a of c.announcements) {
    const cls = classify(a.title, a.sourceCategory);
    const isResults = cls.category === "results" && (cls.subtype === "intimation" || cls.subtype === "postponed");
    const isCall = cls.category === "earnings_call" && cls.subtype === "intimation";
    if (!isResults && !isCall) continue;
    for (const d of datesIn(a.title, ref.getUTCFullYear())) {
      if (d < refDay || d > horizon) continue;
      const label = isCall ? "Earnings call" : cls.subtype === "postponed" ? "Results (rescheduled)" : "Results board meeting";
      if (!out.some((e) => e.date === d && e.label.startsWith(label.split(" ")[0]))) out.push({ symbol: c.symbol, company: c.name, date: d, label, url: a.url });
    }
  }
  return out;
}

function holdingOf(c: CompanyData, items: FeedItem[]): Holding {
  const q = c.quarters;
  const latest = q.headers[q.headers.length - 1] ?? null;
  const t = latest ? buildResultsTable(c, latest) : null;
  const rev = q.rows.Sales ?? q.rows.Revenue;
  const op = q.rows["Operating Profit"] ?? q.rows["Net Profit"];
  const marginTrend = rev && op ? rev.slice(-8).map((r, i) => ratio(op.slice(-8)[i], r)) : [];
  const vm = c.price?.history ? volumeMultiple(c.price.history, DEFAULT_RULES.volumeLookback) : null;
  const mine = items.filter((i) => i.symbol === c.symbol && i.tier !== "routine");
  return {
    symbol: c.symbol, name: c.name, sector: c.sector, price: c.price ? { ...c.price, history: c.price.history?.slice(-30) } : null,
    latestQuarter: latest,
    revenueYoY: t?.rows.find((r) => r.metric === "Revenue")?.yoyChange ?? null,
    patYoY: t?.rows.find((r) => r.metric === "PAT")?.yoyChange ?? null,
    marginTrend,
    volumeMultiple: vm ? Math.round(vm.multiple * 100) / 100 : null,
    openItems: mine.length,
    topTier: mine.length ? mine.reduce((best, i) => (TIER_RANK[i.tier] < TIER_RANK[best] ? i.tier : best), "routine" as Tier) : null,
    provenance: c.provenance.price,
  };
}

export function marketAlerts(companies: CompanyData[], rules = DEFAULT_RULES): MarketAlert[] {
  const out: MarketAlert[] = [];
  for (const c of companies) {
    if (!c.price) continue;
    const move = c.price.history ? lastDayMove(c.price.history) : c.price.changePct != null ? { pct: c.price.changePct, date: c.price.date ?? "" } : null;
    if (move && Math.abs(move.pct) >= rules.priceMovePct)
      out.push({ symbol: c.symbol, company: c.name, kind: "price", value: Math.round(move.pct * 100) / 100, threshold: rules.priceMovePct, date: move.date || null,
        text: `${move.pct > 0 ? "Up" : "Down"} ${Math.abs(move.pct).toFixed(2)}% ${c.price.kind === "intraday" ? "intraday" : "on the day"} (threshold ±${rules.priceMovePct}%)`, provenance: c.provenance.price });
    const vm = c.price.history ? volumeMultiple(c.price.history, rules.volumeLookback) : null;
    if (vm && vm.multiple >= rules.volumeMultiple)
      out.push({ symbol: c.symbol, company: c.name, kind: "volume", value: Math.round(vm.multiple * 100) / 100, threshold: rules.volumeMultiple, date: vm.date,
        text: `Volume ${vm.multiple.toFixed(1)}× its ${rules.volumeLookback}-day average`, provenance: c.provenance.price });
  }
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

export async function buildBriefing(windowHours = 24, symbols: readonly string[] = PORTFOLIO): Promise<Briefing> {
  const results = await Promise.all(symbols.map((s) => getCompany(s)));
  const companies = results.map((r) => r.company).filter((c): c is CompanyData => !!c);
  const warnings = [...new Set(results.flatMap((r) => r.report.failures))].slice(0, 6);
  const modes = new Set(companies.map((c) => c.provenance.announcements.mode));
  const allSnapshot = !modes.has("live");
  // In snapshot mode "now" is the capture time, so the window describes the same day the data describes.
  const ref = allSnapshot ? new Date(SNAPSHOT_CAPTURED_AT) : new Date();

  const all = companies.flatMap(processCompany);
  const windowCounts = [24, 72, 168, 720].map((h) => {
    const w = all.filter((i) => inWindow(i, ref, h));
    return { hours: h, high: w.filter((i) => i.tier === "high").length, surfaced: w.filter((i) => i.tier !== "routine").length };
  });
  const windowed = all.filter((i) => inWindow(i, ref, windowHours));
  const sorted = windowed.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.score - a.score || b.date.localeCompare(a.date));
  const items = sorted.filter((i) => i.tier !== "routine");
  const routine = sorted.filter((i) => i.tier === "routine");
  const holdings = companies.map((c) => holdingOf(c, windowed));
  const upcoming = companies.flatMap((c) => upcomingFrom(c, ref)).sort((a, b) => a.date.localeCompare(b.date));
  const market = marketAlerts(companies);

  const sources: Provenance[] = [];
  for (const k of ["announcements", "price", "fundamentals"] as const) {
    const ps = companies.map((c) => c.provenance[k]);
    const live = ps.filter((p) => p.mode === "live").length;
    const p = ps.find((x) => x.mode === "live") ?? ps[0];
    if (p) sources.push({ ...p, note: `${live}/${ps.length} live${p.note ? " · " + p.note : ""}` });
  }

  return {
    generatedAt: new Date().toISOString(),
    referenceTime: ref.toISOString(),
    windowHours,
    mode: allSnapshot ? "snapshot" : modes.size > 1 ? "mixed" : "live",
    digest: digest(items, routine, holdings, upcoming, market, windowHours),
    items, routine, market, upcoming, holdings,
    stats: { filings: windowed.length + 0, surfaced: items.length, hidden: routine.length, companiesWithNews: new Set(windowed.map((i) => i.symbol)).size },
    sources,
    warnings,
    windowCounts,
  };
}

function digest(items: FeedItem[], routine: FeedItem[], holdings: Holding[], upcoming: UpcomingEvent[], market: MarketAlert[], hours: number): string[] {
  const out: string[] = [];
  const high = items.filter((i) => i.tier === "high");
  const span = hours <= 24 ? "today" : `in the last ${Math.round(hours / 24)} days`;
  if (high.length) out.push(`${high.length} item${high.length > 1 ? "s" : ""} need${high.length > 1 ? "" : "s"} attention ${span}: ${high.slice(0, 3).map((i) => `${short(i.company)} — ${lower(i.headline)}`).join("; ")}.`);
  else if (items.length) out.push(`No high-priority items ${span}. Worth a look: ${items.filter((i) => i.tier === "medium").slice(0, 3).map((i) => `${short(i.company)} — ${lower(i.headline)}`).join("; ") || `${items.length} lower-priority filings`}.`);
  else out.push(`A quiet window — no material filings across the portfolio ${span}.`);

  const reported = items.filter((i) => i.category === "results" && i.results && !("pending" in i.results));
  if (reported.length >= 2) {
    const withPat = reported.map((i) => ({ i, pct: (i.results as Exclude<FeedItem["results"], { pending: true } | undefined>)!.rows.find((r) => r.metric === "PAT")!.yoyChange.pct })).filter((x) => x.pct != null) as { i: FeedItem; pct: number }[];
    withPat.sort((a, b) => b.pct - a.pct);
    if (withPat.length >= 2) out.push(`${reported.length} holdings reported: ${short(withPat[0].i.company)} led on profit growth (PAT ${fmt(withPat[0].pct)} YoY), ${short(withPat[withPat.length - 1].i.company)} trailed (${fmt(withPat[withPat.length - 1].pct)}).`);
  }
  const moves = market.filter((m) => m.kind === "price").slice(0, 2);
  if (moves.length) out.push(`Price moves beyond threshold: ${moves.map((m) => `${short(m.company)} ${fmt(m.value)}`).join(", ")}.`);
  if (upcoming.length) out.push(`Coming up: ${upcoming.slice(0, 3).map((u) => `${short(u.company)} ${u.label.toLowerCase()} ${fmtDay(u.date)}`).join(", ")}.`);
  if (routine.length) out.push(`${routine.length} routine filing${routine.length > 1 ? "s" : ""} (ESOP allotments, compliance certificates, notices) collapsed.`);
  void holdings; void parseQuarterLabel; void fiscalLabel;
  return out;
}

const short = (n: string) => n.replace(/ (Industries|Limited|Ltd|Company|Technologies|India|Pharmaceutical)$/i, "").replace(/ \(.*\)$/, "");
const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const fmt = (p: number) => `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;

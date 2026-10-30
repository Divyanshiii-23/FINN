// Domain types shared by the ingestion pipeline, the API layer and the UI.

export const CATEGORIES = [
  "results", "M&A", "fund_raise", "management_change", "litigation", "insider_trading", "earnings_call",
  "investor_meetings", "credit_rating", "dividend", "bonus_split", "capex", "press_release", "postal_ballot",
  "agm_egm", "pledging", "unclassified",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  results: "Results", "M&A": "M&A", fund_raise: "Fund raise", management_change: "Management", litigation: "Litigation",
  insider_trading: "Insider / SAST", earnings_call: "Earnings call", investor_meetings: "Investor meet", credit_rating: "Credit rating",
  dividend: "Dividend", bonus_split: "Bonus / split", capex: "Capex", press_release: "Press release", postal_ballot: "Postal ballot",
  agm_egm: "AGM / EGM", pledging: "Pledging", unclassified: "Routine",
};

/** Where a piece of data came from. Every number shown in the UI carries one of these. */
export interface Provenance {
  mode: "live" | "snapshot" | "unavailable";
  provider: string; // e.g. "Yahoo Finance chart API", "BSE announcements API", "screener.in"
  asOf: string; // ISO timestamp (or date) the data describes / was captured
  url?: string;
  note?: string;
}

export type CompanyKind = "corporate" | "bank" | "nbfc";

export interface QuarterTable {
  headers: string[]; // "Sep 2026" …
  rows: Record<string, (number | null)[]>;
}

export interface AnnualTable {
  headers: string[];
  pl: Record<string, (number | null)[]>;
  bs: Record<string, (number | null)[]>;
  cf: Record<string, (number | null)[]>;
  ratios: Record<string, (number | null)[]>;
}

export interface PriceBar { date: string; close: number; volume: number | null }

export interface PriceInfo {
  value: number;
  changePct: number | null;
  date: string | null;
  kind: "close" | "intraday";
  asOfText: string;
  history?: PriceBar[];
}

export interface RawAnnouncement {
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM (IST) when the source provides it
  title: string;
  url: string;
  sourceCategory?: string; // exchange-provided category, when live
  summary?: string; // exchange "more" text, when live
}

export interface Concall { period: string; transcript: string | null; ppt: string | null }

export interface CompanyData {
  symbol: string;
  bse: string | null;
  name: string;
  sector: string;
  kind: CompanyKind;
  about: string | null;
  price: PriceInfo | null;
  quarters: QuarterTable;
  annual: AnnualTable | null;
  announcements: RawAnnouncement[];
  concalls: Concall[];
  annualReports: { year: string; url: string }[];
  provenance: { price: Provenance; announcements: Provenance; fundamentals: Provenance };
}

// ---------------------------------------------------------------- derived / pipeline outputs

export interface Change {
  pct: number | null;
  display: string; // "+12.4%", "Swung to loss", "n.m." …
  direction: "up" | "down" | "flat" | "na";
  note?: string;
}

export type ResultsMetric = "Revenue" | "EBITDA" | "PBT" | "PAT" | "NII";

export interface ResultsRow {
  metric: ResultsMetric;
  label: string;
  definition: string;
  current: number | null;
  prev: number | null;
  yoy: number | null;
  qoq: Change;
  yoyChange: Change;
  notMeaningful?: string; // e.g. EBITDA for a bank
}

export interface ResultsTable {
  quarter: string;
  prevQuarter: string | null;
  yoyQuarter: string | null;
  basis: string; // "Consolidated, ₹ crore (screener.in standardised)"
  rows: ResultsRow[];
  margin?: { label: string; current: number | null; prev: number | null; yoy: number | null; qoqBps: number | null; yoyBps: number | null };
  provenance: Provenance;
}

export interface Reason {
  text: string;
  delta: number; // contribution to the materiality score
  basis: "rule" | "computed" | "filing" | "enrichment";
}

export interface Evidence { label: string; url: string; detail?: string }

export interface ManagementChange {
  role: string;
  seniority: "top" | "board" | "kmp";
  outgoing?: string;
  incoming?: string;
  effective?: string;
  profile?: { summary: string; points: string[]; sources: Evidence[]; basis: "enrichment" };
}

export type Tier = "high" | "medium" | "low" | "routine";

export interface FeedItem {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  category: Category;
  title: string; // exchange filing title (as filed / condensed)
  date: string;
  time?: string;
  url: string;
  score: number;
  tier: Tier;
  reasons: Reason[];
  headline: string; // FINN's short headline
  whatHappened: string;
  whyItMatters: string | null;
  watch?: string | null;
  interpretation: "rules" | "llm";
  results?: ResultsTable | { pending: true; quarter: string; note: string; claim?: string };
  management?: ManagementChange;
  related: { title: string; url: string; date: string; category: Category }[];
  amountCr?: number | null;
  provenance: Provenance;
}

export interface MarketAlert {
  symbol: string;
  company: string;
  kind: "price" | "volume";
  value: number; // % move or volume multiple
  threshold: number;
  date: string | null;
  text: string;
  provenance: Provenance;
}

export interface UpcomingEvent { symbol: string; company: string; date: string; label: string; url: string }

export interface Holding {
  symbol: string;
  name: string;
  sector: string;
  price: PriceInfo | null;
  latestQuarter: string | null;
  revenueYoY: Change | null;
  patYoY: Change | null;
  marginTrend: (number | null)[];
  volumeMultiple: number | null;
  openItems: number;
  topTier: Tier | null;
  provenance: Provenance;
}

export interface Briefing {
  generatedAt: string;
  referenceTime: string; // "now" for window maths (snapshot capture time in snapshot mode)
  windowHours: number;
  mode: "live" | "snapshot" | "mixed";
  digest: string[]; // 2-4 sentences, deterministic
  items: FeedItem[]; // non-routine, sorted
  routine: FeedItem[];
  market: MarketAlert[];
  upcoming: UpcomingEvent[];
  holdings: Holding[];
  stats: { filings: number; surfaced: number; hidden: number; companiesWithNews: number };
  sources: Provenance[];
  warnings: string[];
  windowCounts: { hours: number; high: number; surfaced: number }[];
}

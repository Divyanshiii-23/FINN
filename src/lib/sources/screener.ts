import * as cheerio from "cheerio";
import type { AnnualTable, Concall, QuarterTable, RawAnnouncement } from "../types";
import { cached, getJson, getText, SourceError } from "./http";

export interface ScreenerCompany {
  symbol: string;
  name: string;
  bse: string | null;
  nse: string | null;
  sector: string | null;
  about: string | null;
  price: number | null;
  quarters: QuarterTable;
  annual: AnnualTable | null;
  announcements: RawAnnouncement[];
  concalls: Concall[];
  annualReports: { year: string; url: string }[];
  url: string;
  consolidated: boolean;
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

export const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.replace(/[,%₹\s ]/g, "");
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s*\+\s*$/, "").replace(/\s+/g, " ").trim();

function table($: cheerio.CheerioAPI, sectionId: string): { headers: string[]; rows: Record<string, (number | null)[]> } | null {
  const t = $(`section#${sectionId} table.data-table, section#${sectionId} table`).first();
  if (!t.length) return null;
  const headers = t.find("thead th").toArray().slice(1).map((th) => clean($(th).text()));
  const rows: Record<string, (number | null)[]> = {};
  t.find("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td").toArray();
    if (cells.length < 2) return;
    const label = clean($(cells[0]).text());
    if (!label || /raw pdf/i.test(label)) return;
    rows[label] = cells.slice(1).map((td) => num($(td).text()));
  });
  return headers.length && Object.keys(rows).length ? { headers, rows } : null;
}

/** "30 Oct - summary" → ISO date, rolling back a year when the month is in the future. */
function dateFromStub(stub: string, now = new Date()): string | null {
  const m = stub.match(/(\d{1,2})\s+([A-Z][a-z]{2})(?:\s+(\d{4}))?/);
  if (!m) return null;
  let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  if (!m[3] && (month > now.getUTCMonth() + 0 || (month === now.getUTCMonth() && Number(m[1]) > now.getUTCDate() + 1))) year -= 1;
  return new Date(Date.UTC(year, month, Number(m[1]))).toISOString().slice(0, 10);
}

export function parseScreenerHtml(html: string, symbol: string, url: string, now = new Date()): ScreenerCompany {
  const $ = cheerio.load(html);
  const text = $("body").text();
  const q = table($, "quarters");
  const pl = table($, "profit-loss");
  const bs = table($, "balance-sheet");
  const cf = table($, "cash-flow");
  const rt = table($, "ratios");

  const topRatio = (name: string) => {
    let v: number | null = null;
    $("#top-ratios li").each((_, li) => {
      if (clean($(li).find(".name").text()).toLowerCase() === name.toLowerCase()) v = num($(li).find(".number").first().text() || $(li).find(".value").text());
    });
    return v;
  };

  const announcements: RawAnnouncement[] = [];
  const seen = new Set<string>();
  $("#documents .documents").each((_, box) => {
    const heading = clean($(box).find("h3").first().text()).toLowerCase();
    if (heading && !heading.includes("announcement")) return;
    $(box).find("li a").each((__, a) => {
      const href = $(a).attr("href");
      if (!href || seen.has(href)) return;
      const stub = clean($(a).find("div").first().text());
      const title = clean($(a).clone().children("div").remove().end().text());
      const date = dateFromStub(stub, now);
      if (!date || !title) return;
      seen.add(href);
      announcements.push({ date, title, url: href.startsWith("http") ? href : `https://www.screener.in${href}`, summary: stub.replace(/^\d{1,2}\s+[A-Z][a-z]{2}(\s+\d{4})?\s*-\s*/, "") || undefined });
    });
  });

  const concalls: Concall[] = [];
  $("#documents .concalls li, #documents .documents.concalls li").each((_, li) => {
    const period = clean($(li).find("div").first().text());
    let transcript: string | null = null, ppt: string | null = null;
    $(li).find("a").each((__, a) => {
      const label = clean($(a).text()).toLowerCase(), href = $(a).attr("href") ?? null;
      if (label.startsWith("transcript")) transcript = href;
      if (label === "ppt") ppt = href;
    });
    if (/^[A-Z][a-z]{2}\s+\d{4}$/.test(period)) concalls.push({ period, transcript, ppt });
  });

  const annualReports: { year: string; url: string }[] = [];
  $("#documents .annual-reports li a, #documents .documents.annual-reports li a").each((_, a) => {
    const y = clean($(a).text()).match(/(20\d{2})/)?.[1];
    const href = $(a).attr("href");
    if (y && href && !annualReports.some((r) => r.year === y)) annualReports.push({ year: y, url: href });
  });

  const annual: AnnualTable | null = pl
    ? { headers: pl.headers.filter((h) => h !== "TTM"), pl: trimTTM(pl), bs: bs?.rows ?? {}, cf: cf?.rows ?? {}, ratios: rt?.rows ?? {} }
    : null;

  return {
    symbol,
    name: clean($("h1").first().text()) || symbol,
    bse: text.match(/BSE:\s*(\d{6})/)?.[1] ?? null,
    nse: text.match(/NSE:\s*([A-Z0-9&\-]+)/)?.[1] ?? null,
    sector: clean($("#peers a[href*='/market/']").last().text()) || null,
    about: clean($(".company-profile .about p, .about p").first().text()) || null,
    price: topRatio("Current Price"),
    quarters: q ?? { headers: [], rows: {} },
    annual,
    announcements,
    concalls,
    annualReports,
    url,
    consolidated: url.includes("/consolidated/"),
  };
}

function trimTTM(t: { headers: string[]; rows: Record<string, (number | null)[]> }) {
  const idx = t.headers.indexOf("TTM");
  if (idx < 0) return t.rows;
  return Object.fromEntries(Object.entries(t.rows).map(([k, v]) => [k, v.filter((_, i) => i !== idx)]));
}

/** Live company page: consolidated first, standalone if the consolidated view carries no quarterly data. */
export async function screenerCompany(symbol: string): Promise<ScreenerCompany> {
  return cached(`screener:${symbol}`, 6 * 3600e3, async () => {
    let last: unknown;
    for (const variant of ["consolidated/", ""]) {
      const url = `https://www.screener.in/company/${encodeURIComponent(symbol)}/${variant}`;
      try {
        const html = await getText(url, "screener.in", { revalidate: 6 * 3600 });
        const parsed = parseScreenerHtml(html, symbol, url);
        if (parsed.quarters.headers.length) return parsed;
      } catch (e) { last = e; }
    }
    throw last instanceof Error ? last : new SourceError("screener.in", `no fundamentals found for ${symbol}`);
  });
}

export interface TickerHit { symbol: string; name: string }

/** Company search — used to resolve free-text input to an NSE symbol. */
export async function screenerSearch(q: string): Promise<TickerHit[]> {
  const res = await getJson<{ name: string; url: string }[]>(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}&v=3&fts=1`, "screener.in search", { timeoutMs: 4000, revalidate: 86400 });
  return res
    .map((r) => ({ name: r.name, symbol: r.url.match(/\/company\/([^/]+)\//)?.[1] ?? "" }))
    .filter((r) => r.symbol && !/^\d+$/.test(r.symbol))
    .slice(0, 8);
}

import "server-only";
import type { CompanyData, Provenance } from "../types";
import snapshotJson from "../../../data/snapshot/companies.json";
import { yahooPrice } from "./yahoo";
import { bseAnnouncements } from "./bse";
import { screenerCompany } from "./screener";

type SnapCompany = Omit<CompanyData, "provenance"> & { source: { url: string; capturedAt: string } };
const SNAP = snapshotJson as unknown as { capturedAt: string; companies: Record<string, SnapCompany> };

export const SNAPSHOT_CAPTURED_AT = SNAP.capturedAt;
export const snapshotSymbols = () => Object.keys(SNAP.companies);

/** auto (default): try live, fall back to the recorded snapshot per source. snapshot: never touch the network. live: no fallback. */
export function dataMode(): "auto" | "snapshot" | "live" {
  const m = (process.env.FINN_DATA_MODE ?? "auto").toLowerCase();
  return m === "snapshot" || m === "live" ? m : "auto";
}

const snapProv = (provider: string, s: SnapCompany, note?: string): Provenance => ({
  mode: "snapshot", provider, asOf: SNAP.capturedAt, url: s.source.url, note: note ?? "Recorded snapshot — live source not used or unreachable",
});
const unavailable = (provider: string, note: string): Provenance => ({ mode: "unavailable", provider, asOf: new Date().toISOString(), note });

export interface FetchReport { symbol: string; failures: string[] }

/**
 * One company, assembled from three independent sources. Each part falls back on its own,
 * so a blocked BSE endpoint never takes prices or fundamentals down with it.
 */
export async function getCompany(symbolIn: string, want: { prices?: boolean; announcements?: boolean } = {}): Promise<{ company: CompanyData | null; report: FetchReport }> {
  const symbol = symbolIn.trim().toUpperCase();
  const mode = dataMode();
  const snap = SNAP.companies[symbol];
  const failures: string[] = [];
  const live = mode !== "snapshot";

  // fundamentals (also yields the BSE code + document links for any ticker)
  let fundamentals: Awaited<ReturnType<typeof screenerCompany>> | null = null;
  if (live) {
    try { fundamentals = await screenerCompany(symbol); } catch (e) { failures.push(String((e as Error).message)); }
  }
  if (!fundamentals && !snap) return { company: null, report: { symbol, failures } };

  const bse = fundamentals?.bse ?? snap?.bse ?? null;
  const [priceRes, annRes] = await Promise.allSettled([
    live && want.prices !== false ? yahooPrice(symbol) : Promise.reject(new Error("skipped")),
    live && want.announcements !== false && bse ? bseAnnouncements(bse) : Promise.reject(new Error("skipped")),
  ]);
  if (priceRes.status === "rejected" && priceRes.reason?.message !== "skipped") failures.push(priceRes.reason.message);
  if (annRes.status === "rejected" && annRes.reason?.message !== "skipped") failures.push(annRes.reason.message);

  const now = new Date().toISOString();
  const base = snap ?? ({} as SnapCompany);
  const company: CompanyData = {
    symbol,
    bse,
    name: base.name ?? fundamentals!.name,
    sector: base.sector ?? fundamentals?.sector ?? "—",
    kind: base.kind ?? inferKind(fundamentals),
    about: base.about ?? null,
    price: null,
    quarters: fundamentals?.quarters ?? base.quarters,
    annual: fundamentals?.annual ?? base.annual ?? null,
    announcements: [],
    concalls: fundamentals?.concalls.length ? fundamentals.concalls : base.concalls ?? [],
    annualReports: fundamentals?.annualReports.length ? fundamentals.annualReports : base.annualReports ?? [],
    provenance: {
      fundamentals: fundamentals
        ? { mode: "live", provider: "screener.in", asOf: now, url: fundamentals.url }
        : snapProv("screener.in", base),
      price: unavailable("Yahoo Finance", "No price source reachable"),
      announcements: unavailable("BSE announcements", "No announcement source reachable"),
    },
  };

  if (priceRes.status === "fulfilled") {
    company.price = priceRes.value;
    company.provenance.price = { mode: "live", provider: "Yahoo Finance (EOD chart API)", asOf: now, url: `https://finance.yahoo.com/quote/${symbol}.NS` };
  } else if (snap?.price) {
    company.price = snap.price;
    company.provenance.price = snapProv("screener.in quote", snap, `Price as shown on screener.in (${snap.price.asOfText}). Volume history not in snapshot — live mode adds it.`);
  }

  if (annRes.status === "fulfilled" && annRes.value.length) {
    company.announcements = annRes.value;
    company.provenance.announcements = { mode: "live", provider: "BSE corporate announcements", asOf: now, url: `https://www.bseindia.com/stock-share-price/x/${symbol}/${bse}/corp-announcements/` };
  } else if (fundamentals?.announcements.length) {
    company.announcements = fundamentals.announcements;
    company.provenance.announcements = { mode: "live", provider: "screener.in (filings list, BSE links)", asOf: now, url: fundamentals.url, note: "BSE API unreachable — using the filing list on the company page" };
  } else if (snap?.announcements?.length) {
    company.announcements = snap.announcements;
    company.provenance.announcements = snapProv("screener.in (filings list, BSE links)", snap, "Recorded snapshot of recent filings; titles may be condensed — every item links to the BSE PDF");
  }

  return { company, report: { symbol, failures } };
}

function inferKind(f: Awaited<ReturnType<typeof screenerCompany>> | null): CompanyData["kind"] {
  if (!f) return "corporate";
  return f.quarters.rows["Financing Profit"] ? (/bank/i.test(f.name) ? "bank" : "nbfc") : "corporate";
}

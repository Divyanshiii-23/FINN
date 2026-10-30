import type { CompanyData, ResultsRow, ResultsTable } from "../types";
import { bps, pctChange, ratio } from "./change";
import { shiftQuarter } from "./quarters";

const pick = (rows: Record<string, (number | null)[]>, ...names: string[]) => {
  for (const n of names) if (rows[n]) return rows[n];
  return undefined;
};

/**
 * Headline results first-cut: Revenue, EBITDA, PBT, PAT — current vs previous quarter (QoQ) and vs the
 * same quarter last year (YoY). Pure arithmetic over the standardised quarterly table; no model involved.
 *
 * Definitions (stated in the UI next to every table):
 *  - Revenue: Sales (corporates) / total interest & operating revenue (banks, NBFCs)
 *  - EBITDA: Operating profit before other income, interest, depreciation and tax (Sales − operating expenses)
 *    → not meaningful for lenders, where interest is the cost of raw material; we show Revenue − interest instead.
 *  - PBT, PAT: as reported (PAT = consolidated net profit)
 */
export function buildResultsTable(c: CompanyData, quarter: string): ResultsTable | null {
  const { headers, rows } = c.quarters;
  const i = headers.indexOf(quarter);
  if (i < 0) return null;
  const prevLabel = shiftQuarter(quarter, -1);
  const yoyLabel = shiftQuarter(quarter, -4);
  const ip = prevLabel ? headers.indexOf(prevLabel) : -1;
  const iy = yoyLabel ? headers.indexOf(yoyLabel) : -1;
  const at = (row: (number | null)[] | undefined, idx: number) => (row && idx >= 0 ? row[idx] ?? null : null);

  const lender = c.kind === "bank" || c.kind === "nbfc";
  const revenue = pick(rows, "Sales", "Revenue");
  const opProfit = pick(rows, "Operating Profit");
  const interest = pick(rows, "Interest");
  const pbt = pick(rows, "Profit before tax");
  const pat = pick(rows, "Net Profit");

  const mk = (metric: ResultsRow["metric"], label: string, definition: string, row: (number | null)[] | undefined, nm?: string): ResultsRow => {
    const cur = at(row, i), prev = at(row, ip), yoy = at(row, iy);
    return { metric, label, definition, current: cur, prev, yoy, qoq: pctChange(cur, prev), yoyChange: pctChange(cur, yoy), notMeaningful: nm };
  };

  const out: ResultsRow[] = [mk("Revenue", "Revenue", lender ? "Total revenue (interest earned + operating income)" : "Revenue from operations (Sales)", revenue)];
  if (lender) {
    const nii = revenue && interest ? revenue.map((v, k) => (v == null || interest[k] == null ? null : v - (interest[k] as number))) : undefined;
    const ebitda = mk("EBITDA", "EBITDA", "Not meaningful for lenders", undefined, "Interest is a lender's cost of goods; EBITDA is not a meaningful measure for banks/NBFCs.");
    out.push(ebitda);
    out.push(mk("NII", "Revenue less interest", "Revenue minus interest expended (screener basis; differs from reported NII, which excludes fee income)", nii));
  } else {
    out.push(mk("EBITDA", "EBITDA", "Operating profit: Sales − operating expenses (excludes other income)", opProfit));
  }
  out.push(mk("PBT", "PBT", "Profit before tax, as reported", pbt));
  out.push(mk("PAT", "PAT", "Net profit, as reported (consolidated)", pat));

  let margin: ResultsTable["margin"];
  if (!lender && opProfit && revenue) {
    const m = (idx: number) => (idx >= 0 ? ratio(opProfit[idx], revenue[idx]) : null);
    const cur = m(i), prev = m(ip), yoy = m(iy);
    margin = { label: "EBITDA margin", current: cur, prev, yoy, qoqBps: bps(cur, prev), yoyBps: bps(cur, yoy) };
  } else if (pat && revenue) {
    const m = (idx: number) => (idx >= 0 ? ratio(pat[idx], revenue[idx]) : null);
    const cur = m(i), prev = m(ip), yoy = m(iy);
    margin = { label: "PAT / revenue", current: cur, prev, yoy, qoqBps: bps(cur, prev), yoyBps: bps(cur, yoy) };
  }

  return {
    quarter,
    prevQuarter: ip >= 0 ? prevLabel : null,
    yoyQuarter: iy >= 0 ? yoyLabel : null,
    basis: "Consolidated · ₹ crore · standardised by screener.in from the exchange filing",
    rows: out,
    margin,
    provenance: c.provenance.fundamentals,
  };
}

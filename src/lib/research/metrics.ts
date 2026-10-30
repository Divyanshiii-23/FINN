import type { CompanyData } from "../types";
import type { Fact, Section, Series } from "./types";
import { bps, cagr, pctChange, ratio } from "../finance/change";
import { fiscalLabel, ttm } from "../finance/quarters";
import { fmtCr, fmtPct } from "../format";

const last = <T,>(a: T[] | undefined) => (a && a.length ? a[a.length - 1] : undefined);
const at = (a: (number | null)[] | undefined, i: number) => (a && i >= 0 && i < a.length ? a[i] : null);
const lender = (c: CompanyData) => c.kind !== "corporate";
const yr = (h: string) => h.replace("Mar ", "FY").replace(/FY20(\d\d)/, "FY$1");
const series = (label: string, unit: string, xs: string[], ys: (number | null)[]): Series => ({ label, unit, points: xs.map((x, i) => ({ x, y: ys[i] ?? null })) });

export function snapshotSection(c: CompanyData): Section<{ facts: Fact[] }> {
  const q = c.quarters.rows;
  const rev = q.Sales ?? q.Revenue, op = q["Operating Profit"], pat = q["Net Profit"];
  const facts: Fact[] = [];
  const latest = last(c.quarters.headers);
  const tRev = ttm(rev), tPat = ttm(pat), tOp = ttm(op);
  if (tRev != null) facts.push({ label: "Revenue (TTM)", value: `₹${fmtCr(tRev)} cr`, kind: "calc", period: `4Q to ${latest}`, detail: "Sum of last four reported quarters" });
  if (!lender(c) && tOp != null && tRev) facts.push({ label: "EBITDA margin (TTM)", value: fmtPct(ratio(tOp, tRev)), kind: "calc", period: `4Q to ${latest}`, detail: `EBITDA ₹${fmtCr(tOp)} cr (operating profit before other income)` });
  if (tPat != null) facts.push({ label: "PAT (TTM)", value: `₹${fmtCr(tPat)} cr`, kind: "calc", period: `4Q to ${latest}`, detail: tRev ? `Net margin ${fmtPct(ratio(tPat, tRev))}` : undefined });
  const prevRev = rev && rev.length >= 8 ? rev.slice(-8, -4).reduce((a: number, b) => a + (b ?? 0), 0) : null;
  if (tRev != null && prevRev) facts.push({ label: "Revenue growth (TTM YoY)", value: pctChange(tRev, prevRev).display, kind: "calc", period: `4Q to ${latest}`, tone: tRev >= prevRev ? "pos" : "neg" });
  const roce = last(c.annual?.ratios["ROCE %"]);
  if (roce != null) facts.push({ label: "ROCE", value: `${roce}%`, kind: "reported", period: yr(last(c.annual!.headers)!), detail: "As standardised by screener.in", tone: roce >= 20 ? "pos" : roce < 12 ? "neg" : "neutral" });
  const bs = c.annual?.bs;
  if (bs?.Borrowings) {
    const i = bs.Borrowings.length - 1;
    const eq = (at(bs["Equity Capital"], i) ?? 0) + (at(bs.Reserves, i) ?? 0);
    const de = eq ? (bs.Borrowings[i] ?? 0) / eq : null;
    if (de != null) facts.push({ label: "Debt / equity", value: `${de.toFixed(2)}×`, kind: "calc", period: c.annual!.headers[Math.min(i, c.annual!.headers.length - 1)], tone: lender(c) ? "neutral" : de < 0.3 ? "pos" : de > 1 ? "neg" : "neutral", detail: lender(c) ? "Leverage is the business model for a lender" : undefined });
  }
  return facts.length ? { status: "ok", data: { facts } } : { status: "unavailable", note: "No standardised financials available.", data: { facts } };
}

export function trajectorySection(c: CompanyData): Section<{ annual: Series[]; quarterly: Series[]; facts: Fact[] }> {
  const facts: Fact[] = [];
  const annual: Series[] = [];
  const qh = c.quarters.headers, q = c.quarters.rows;
  const qrev = q.Sales ?? q.Revenue, qop = q["Operating Profit"], qpat = q["Net Profit"];
  const quarterly: Series[] = [];
  if (qrev) quarterly.push(series("Revenue", "₹ cr", qh.map(fiscalLabel), qrev));
  if (qpat) quarterly.push(series("PAT", "₹ cr", qh.map(fiscalLabel), qpat));
  if (!lender(c) && qop && qrev) quarterly.push(series("EBITDA margin", "%", qh.map(fiscalLabel), qrev.map((r, i) => ratio(qop[i], r))));

  const a = c.annual;
  if (a?.pl && (a.pl.Sales || a.pl.Revenue)) {
    const h = a.headers.map(yr);
    const rev = (a.pl.Sales ?? a.pl.Revenue)!, pat = a.pl["Net Profit"], op = a.pl["Operating Profit"];
    annual.push(series("Revenue", "₹ cr", h, rev));
    if (pat) annual.push(series("PAT", "₹ cr", h, pat));
    if (!lender(c) && op) annual.push(series("EBITDA margin", "%", h, rev.map((r, i) => ratio(op[i], r))));
    const n = rev.length - 1;
    for (const [years, lbl] of [[3, "3y"], [5, "5y"], [10, "10y"]] as const) {
      if (n - years < 0) continue;
      const g = cagr(rev[n - years], rev[n], years);
      const gp = pat ? cagr(pat[n - years], pat[n], years) : null;
      if (g != null) facts.push({ label: `Revenue CAGR ${lbl}`, value: fmtPct(g), kind: "calc", period: `${h[n - years]}→${h[n]}`, detail: gp != null ? `PAT CAGR ${lbl}: ${fmtPct(gp)}` : undefined, tone: g >= 12 ? "pos" : g < 5 ? "neg" : "neutral" });
    }
    if (!lender(c) && op && n >= 3) {
      const m0 = ratio(op[n - 3], rev[n - 3]), m1 = ratio(op[n], rev[n]);
      const d = bps(m1, m0);
      if (d != null) facts.push({ label: "EBITDA margin vs 3 years ago", value: `${fmtPct(m1)} (${d >= 0 ? "+" : "−"}${Math.abs(d)} bps)`, kind: "calc", period: `${h[n - 3]}→${h[n]}`, tone: d >= 0 ? "pos" : "neg", detail: d <= -150 ? "Compressing — growth is coming at a lower margin" : d >= 150 ? "Expanding — operating leverage visible" : "Broadly stable" });
    }
  }
  if (qrev && qop && !lender(c) && qrev.length >= 8) {
    const m = (i: number) => ratio(qop[i], qrev[i]);
    const recent = [m(qrev.length - 1), m(qrev.length - 2)].filter((x): x is number => x != null);
    const older = [m(qrev.length - 5), m(qrev.length - 6)].filter((x): x is number => x != null);
    if (recent.length && older.length) {
      const d = bps(recent.reduce((s, x) => s + x, 0) / recent.length, older.reduce((s, x) => s + x, 0) / older.length)!;
      facts.push({ label: "Margin, last 2Q vs same 2Q last year", value: `${d >= 0 ? "+" : "−"}${Math.abs(d)} bps`, kind: "calc", tone: d >= 0 ? "pos" : "neg", detail: "Average EBITDA margin; removes single-quarter noise" });
    }
  }
  if (qrev && qop && !lender(c) && qrev.length >= 5) {
    const i = qrev.length - 1;
    const cur = ratio(qop[i], qrev[i]), ya = ratio(qop[i - 4], qrev[i - 4]), pq = ratio(qop[i - 1], qrev[i - 1]);
    const dy = bps(cur, ya), dq = bps(cur, pq);
    if (cur != null && dy != null) facts.push({ label: `EBITDA margin, ${fiscalLabel(qh[i])}`, value: `${fmtPct(cur)} (${dy >= 0 ? "+" : "−"}${Math.abs(dy)} bps YoY)`, kind: "calc", period: qh[i], tone: dy >= 0 ? "pos" : "neg", detail: dq != null ? `${dq >= 0 ? "+" : "−"}${Math.abs(dq)} bps QoQ; year-ago ${fmtPct(ya)}` : undefined });
  }
  if (!annual.length && quarterly.length) return { status: "partial", note: "Annual statements not in the snapshot — trajectory uses 13 reported quarters.", data: { annual, quarterly, facts } };
  return quarterly.length || annual.length ? { status: "ok", data: { annual, quarterly, facts } } : { status: "unavailable", note: "No financial history available.", data: { annual, quarterly, facts } };
}

export function balanceSection(c: CompanyData): Section<{ facts: Fact[]; series: Series[] }> {
  const a = c.annual;
  if (!a?.bs?.Borrowings) return { status: "unavailable", note: "Balance sheet not available in the snapshot for this company — live mode reads it from screener.in.", data: { facts: [], series: [] } };
  const bs = a.bs, h = a.headers.slice(0, bs.Borrowings.length).map(yr);
  const eq = bs.Borrowings.map((_, i) => (at(bs["Equity Capital"], i) ?? 0) + (at(bs.Reserves, i) ?? 0));
  const de = bs.Borrowings.map((b, i) => (b != null && eq[i] ? b / eq[i] : null));
  const facts: Fact[] = [];
  const n = bs.Borrowings.length - 1;
  facts.push({ label: "Borrowings", value: `₹${fmtCr(bs.Borrowings[n])} cr`, kind: "reported", period: h[n], detail: n >= 3 ? `vs ₹${fmtCr(bs.Borrowings[n - 3])} cr three years earlier` : undefined });
  facts.push({ label: "Debt / equity", value: `${de[n]?.toFixed(2)}×`, kind: "calc", period: h[n], detail: n >= 3 ? `${de[n - 3]?.toFixed(2)}× three years earlier` : undefined, tone: lender(c) ? "neutral" : (de[n] ?? 0) > (de[n - 3] ?? 0) + 0.15 ? "neg" : "pos" });
  if (bs.CWIP && bs["Fixed Assets"]) {
    const cw = ratio(bs.CWIP[n], bs["Fixed Assets"][n]);
    if (cw != null && !lender(c)) facts.push({ label: "Capital work-in-progress / fixed assets", value: fmtPct(cw, 0), kind: "calc", period: h[n], detail: cw > 30 ? "Large unfinished capex — returns depend on execution" : "Capex largely capitalised", tone: cw > 30 ? "neg" : "neutral" });
  }
  const r = a.ratios;
  for (const k of ["Debtor Days", "Inventory Days", "Cash Conversion Cycle"]) {
    const s = r[k];
    if (!s?.length || last(s) == null) continue;
    const m = s.length - 1;
    const d = m >= 3 && s[m - 3] != null ? (s[m] as number) - (s[m - 3] as number) : null;
    facts.push({ label: k, value: `${s[m]} days`, kind: "reported", period: yr(a.headers[m]), detail: d != null ? `${d >= 0 ? "+" : "−"}${Math.abs(d)} days vs 3 years ago` : undefined, tone: d == null ? "neutral" : d > 10 ? "neg" : d < -10 ? "pos" : "neutral" });
  }
  return { status: "ok", note: lender(c) ? "For a lender, borrowings fund the loan book; read leverage with capital adequacy (in the investor presentation)." : undefined,
    data: { facts, series: [series("Borrowings", "₹ cr", h, bs.Borrowings), series("Debt / equity", "×", h, de)] } };
}

export function cashSection(c: CompanyData): Section<{ facts: Fact[]; series: Series[] }> {
  const a = c.annual;
  if (lender(c)) return { status: "unavailable", note: "Operating cash flow is not a meaningful quality test for a lender: loan disbursements run through operating cash flow, so a growing book shows negative CFO by construction.", data: { facts: [], series: [] } };
  if (!a?.cf?.["Cash from Operating Activity"] || !a.pl?.["Net Profit"]) return { status: "unavailable", note: "Cash-flow statement not available for this company in the snapshot — live mode reads it from screener.in.", data: { facts: [], series: [] } };
  const cfo = a.cf["Cash from Operating Activity"], pat = a.pl["Net Profit"], fcf = a.cf["Free Cash Flow"];
  const n = Math.min(cfo.length, pat.length) - 1;
  const h = a.headers.slice(0, n + 1).map(yr);
  const conv = cfo.slice(0, n + 1).map((v, i) => ratio(v, pat[i]));
  const facts: Fact[] = [];
  const span = Math.min(5, n + 1);
  const sumCfo = cfo.slice(n + 1 - span, n + 1).reduce((s: number, v) => s + (v ?? 0), 0);
  const sumPat = pat.slice(n + 1 - span, n + 1).reduce((s: number, v) => s + (v ?? 0), 0);
  const cum = ratio(sumCfo, sumPat);
  facts.push({ label: `Cash conversion, ${span}-year cumulative`, value: `${cum?.toFixed(0)}%`, kind: "calc", period: `${h[n + 1 - span]}–${h[n]}`, detail: `CFO ₹${fmtCr(sumCfo)} cr vs PAT ₹${fmtCr(sumPat)} cr`, tone: (cum ?? 0) >= 100 ? "pos" : (cum ?? 0) < 80 ? "neg" : "neutral" });
  facts.push({ label: "CFO / PAT, latest year", value: `${conv[n]?.toFixed(0)}%`, kind: "calc", period: h[n], tone: (conv[n] ?? 0) >= 90 ? "pos" : "neg" });
  if (fcf) {
    const sumF = fcf.slice(n + 1 - span, n + 1).reduce((s: number, v) => s + (v ?? 0), 0);
    facts.push({ label: `Free cash flow, ${span}-year total`, value: `₹${fmtCr(sumF)} cr`, kind: "reported", period: `${h[n + 1 - span]}–${h[n]}`, detail: `FCF = CFO − capex (screener basis); ${ratio(sumF, sumPat)?.toFixed(0)}% of PAT`, tone: sumF > 0 ? "pos" : "neg" });
    const negYears = fcf.slice(n + 1 - span, n + 1).filter((v) => (v ?? 0) < 0).length;
    if (negYears) facts.push({ label: "Years with negative FCF", value: `${negYears} of ${span}`, kind: "calc", tone: negYears >= 3 ? "neg" : "neutral", detail: "Capex ahead of operating cash" });
  }
  return { status: "ok", data: { facts, series: [series("CFO", "₹ cr", h, cfo.slice(0, n + 1)), series("PAT", "₹ cr", h, pat.slice(0, n + 1)), ...(fcf ? [series("FCF", "₹ cr", h, fcf.slice(0, n + 1))] : []), series("CFO / PAT", "%", h, conv)] } };
}

/** Deterministic red-flag checks. Each item states the numbers and why the gap matters. */
export function contradictions(c: CompanyData): Fact[] {
  const out: Fact[] = [];
  const a = c.annual, q = c.quarters;
  const qrev = q.rows.Sales ?? q.rows.Revenue;
  if (a?.pl && a.cf?.["Cash from Operating Activity"] && !lender(c)) {
    const rev = (a.pl.Sales ?? a.pl.Revenue)!, cfo = a.cf["Cash from Operating Activity"], pat = a.pl["Net Profit"];
    const n = Math.min(rev.length, cfo.length) - 1;
    if (n >= 3) {
      const rg = cagr(rev[n - 3], rev[n], 3), cg = cagr(cfo[n - 3], cfo[n], 3), pg = pat ? cagr(pat[n - 3], pat[n], 3) : null;
      if (rg != null && cg != null && rg - cg > 10) out.push({ label: "Revenue growing faster than operating cash", value: `Revenue ${fmtPct(rg)} vs CFO ${fmtPct(cg)} CAGR (3y)`, kind: "calc", tone: "neg", detail: "Growth that consumes working capital or is booked ahead of collection." });
      if (pg != null && cg != null && pg - cg > 10) out.push({ label: "Profit outpacing cash", value: `PAT ${fmtPct(pg)} vs CFO ${fmtPct(cg)} CAGR (3y)`, kind: "calc", tone: "neg", detail: "Accrual-driven profit growth; check receivables, inventory and other income." });
    }
    if (pat && n >= 4) {
      const s = (arr: (number | null)[]) => arr.slice(n - 4, n + 1).reduce((t: number, v) => t + (v ?? 0), 0);
      const conv = ratio(s(cfo), s(pat));
      if (conv != null && conv < 80) out.push({ label: "Weak cash conversion", value: `5y CFO/PAT ${conv.toFixed(0)}%`, kind: "calc", tone: "neg", detail: "Persistent profit without matching cash is a red flag." });
    }
  }
  if (a?.bs?.Borrowings && a.pl?.Interest && !lender(c)) {
    const b = a.bs.Borrowings, i = a.pl.Interest;
    const n = Math.min(b.length, i.length) - 1;
    if (n >= 1 && b[n] != null && b[n - 1] != null && i[n] != null && i[n - 1] != null && (b[n] as number) < (b[n - 1] as number) && (i[n] as number) > (i[n - 1] as number) * 1.1)
      out.push({ label: "Debt down, interest up", value: `Borrowings ${pctChange(b[n], b[n - 1]).display}, interest ${pctChange(i[n], i[n - 1]).display}`, kind: "calc", tone: "neg", detail: "Rising cost of debt, intra-year borrowing peaks, or capitalised interest ending." });
  }
  if (qrev && !lender(c)) {
    const oi = q.rows["Other Income"], pbt = q.rows["Profit before tax"];
    const tOi = ttm(oi), tPbt = ttm(pbt);
    const share = tOi != null && tPbt ? (tOi / tPbt) * 100 : null;
    if (share != null && share >= 25) out.push({ label: "Profit leans on other income", value: `Other income ${share.toFixed(0)}% of TTM PBT`, kind: "calc", tone: "neg", detail: "Treasury/one-off income is lower quality than operating profit." });
    const op = q.rows["Operating Profit"];
    if (op && qrev.length >= 8) {
      const tRev = ttm(qrev)!, pRev = qrev.slice(-8, -4).reduce((s: number, v) => s + (v ?? 0), 0);
      const tOp = ttm(op)!, pOp = op.slice(-8, -4).reduce((s: number, v) => s + (v ?? 0), 0);
      const d = bps(ratio(tOp, tRev), ratio(pOp, pRev));
      if (tRev > pRev && d != null && d <= -150) out.push({ label: "Growth at falling margins", value: `Revenue ${pctChange(tRev, pRev).display}, EBITDA margin ${d} bps (TTM vs prior TTM)`, kind: "calc", tone: "neg", detail: "Volume or acquisition-led growth that is not yet profitable at the same rate." });
    }
    const tax = q.rows["Tax %"];
    void tax;
  }
  if (a?.ratios?.["Debtor Days"] && a.pl && !lender(c)) {
    const d = a.ratios["Debtor Days"], rev = (a.pl.Sales ?? a.pl.Revenue)!;
    const n = d.length - 1;
    if (n >= 3 && d[n] != null && d[n - 3] != null && (d[n] as number) - (d[n - 3] as number) >= 15) out.push({ label: "Receivables stretching", value: `Debtor days ${d[n - 3]} → ${d[n]} (3y)`, kind: "reported", tone: "neg", detail: `Revenue ${pctChange(rev[n], rev[n - 3]).display} over the same period — check customer concentration and credit terms.` });
  }
  return out;
}

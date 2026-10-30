#!/usr/bin/env node
// Compiles data/raw/*.txt (records captured from screener.in pages) into data/snapshot/companies.json.
// Runs accounting-identity checks so a transcription error cannot silently enter the snapshot.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rawDir = join(root, "data/raw");
const outDir = join(root, "data/snapshot");
mkdirSync(outDir, { recursive: true });

const CAPTURED_AT = "2026-10-30T23:30:00+05:30";
const YEAR = 2026;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Sept: 8, Oct: 9, Nov: 10, Dec: 11 };

const num = (s) => {
  if (s === undefined) return null;
  const t = String(s).replace(/[,%₹\s]/g, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const list = (s) => s.split(",").map((x) => x.trim());
const dateFromDayMonth = (s) => {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,4})/);
  if (!m) return null;
  const d = new Date(Date.UTC(YEAR, MONTHS[m[2]], Number(m[1])));
  return d.toISOString().slice(0, 10);
};

const companies = {};
let current = null;
const issues = [];

for (const file of readdirSync(rawDir).filter((f) => f.endsWith(".txt"))) {
  for (const raw of readFileSync(join(rawDir, file), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") && !line.startsWith("###")) continue;
    if (line.startsWith("### +")) { current = companies[line.slice(5).trim()]; continue; }
    if (line.startsWith("### ")) {
      const [symbol, bse, name, sector, kind, url] = line.slice(4).split("|");
      current = companies[symbol] = {
        symbol, bse, name, sector, kind, source: { url, capturedAt: CAPTURED_AT, via: "screener.in company page" },
        price: null, quarters: { headers: [], rows: {} }, annual: null, announcements: [], concalls: [], annualReports: [], about: null,
      };
      continue;
    }
    const [tag, ...rest] = line.split("|");
    if (!current) continue;
    switch (tag) {
      case "PRICE": {
        const [v, asOfText, chg] = rest;
        current.price = { value: num(v), asOfText, changePct: num(chg), kind: /close/i.test(asOfText) ? "close" : "intraday", date: dateFromDayMonth(asOfText) };
        break;
      }
      case "QH": current.quarters.headers = list(rest[0]); break;
      case "QR": current.quarters.rows[rest[0]] = list(rest[1]).map(num); break;
      case "YH": current.annual = { headers: list(rest[0]), pl: {}, bs: {}, cf: {}, ratios: {} }; break;
      case "PL": current.annual.pl[rest[0]] = list(rest[1]).map(num); break;
      case "BS": current.annual.bs[rest[0]] = list(rest[1]).map(num); break;
      case "CF": current.annual.cf[rest[0]] = list(rest[1]).map(num); break;
      case "RT": current.annual.ratios[rest[0]] = list(rest[1]).map(num); break;
      case "ANN": current.announcements.push({ date: dateFromDayMonth(rest[0]), title: rest[1], url: rest[2] }); break;
      case "CC": current.concalls.push({ period: rest[0], transcript: rest[1] === "-" ? null : rest[1], ppt: rest[2] === "-" ? null : rest[2] }); break;
      case "AR": current.annualReports.push({ year: rest[0], url: rest[1] }); break;
      case "ABOUT": current.about = rest.join("|"); break;
    }
  }
}

// ---- integrity checks -------------------------------------------------------------------------
const near = (a, b, tol) => a === null || b === null || Math.abs(a - b) <= tol;
for (const c of Object.values(companies)) {
  const q = c.quarters;
  const n = q.headers.length;
  for (const [label, vals] of Object.entries(q.rows)) if (vals.length !== n) issues.push(`${c.symbol} quarterly '${label}' has ${vals.length} values, expected ${n}`);
  const R = q.rows;
  const rev = R.Sales ?? R.Revenue;
  for (let i = 0; i < n; i++) {
    if (R.Sales && R.Expenses && R["Operating Profit"] && !near(R.Sales[i] - R.Expenses[i], R["Operating Profit"][i], 2))
      issues.push(`${c.symbol} ${q.headers[i]}: Sales-Expenses != Operating Profit`);
    if (R["Operating Profit"] && R["Profit before tax"]) {
      const pbt = R["Operating Profit"][i] + (R["Other Income"]?.[i] ?? 0) - (R.Interest?.[i] ?? 0) - (R.Depreciation?.[i] ?? 0);
      if (!near(pbt, R["Profit before tax"][i], 3)) issues.push(`${c.symbol} ${q.headers[i]}: OP+OI-Int-Dep (${pbt}) != PBT (${R["Profit before tax"][i]})`);
    }
    if (R["Financing Profit"] && R["Profit before tax"]) {
      const pbt = R["Financing Profit"][i] + (R["Other Income"]?.[i] ?? 0) - (R.Depreciation?.[i] ?? 0);
      if (!near(pbt, R["Profit before tax"][i], 3)) issues.push(`${c.symbol} ${q.headers[i]}: FinProfit+OI-Dep (${pbt}) != PBT (${R["Profit before tax"][i]})`);
    }
    if (!rev) issues.push(`${c.symbol}: no revenue row`);
  }
  if (c.annual) {
    const { pl, bs, headers } = c.annual;
    for (let i = 0; i < headers.length; i++) {
      const s = pl.Sales;
      if (s && pl.Expenses && !near(s[i] - pl.Expenses[i], pl["Operating Profit"][i], 2)) issues.push(`${c.symbol} ${headers[i]}: annual Sales-Expenses != OP`);
      const liab = (bs["Equity Capital"]?.[i] ?? 0) + (bs.Reserves?.[i] ?? 0) + (bs.Borrowings?.[i] ?? 0) + (bs["Other Liabilities"]?.[i] ?? 0);
      if (bs["Total Liabilities"] && !near(liab, bs["Total Liabilities"][i], 3)) issues.push(`${c.symbol} ${headers[i]}: BS components (${liab}) != Total (${bs["Total Liabilities"][i]})`);
      const assets = (bs["Fixed Assets"]?.[i] ?? 0) + (bs.CWIP?.[i] ?? 0) + (bs.Investments?.[i] ?? 0) + (bs["Other Assets"]?.[i] ?? 0);
      if (bs["Total Liabilities"] && !near(assets, bs["Total Liabilities"][i], 3)) issues.push(`${c.symbol} ${headers[i]}: assets (${assets}) != Total (${bs["Total Liabilities"][i]})`);
    }
  }
  if (!c.price?.value) issues.push(`${c.symbol}: missing price`);
}

const out = { capturedAt: CAPTURED_AT, source: "screener.in company pages (consolidated), captured via web reader", companies };
writeFileSync(join(outDir, "companies.json"), JSON.stringify(out, null, 1));
console.log(`wrote ${Object.keys(companies).length} companies → data/snapshot/companies.json`);
if (issues.length) { console.error(`\n${issues.length} integrity issue(s):\n- ` + issues.join("\n- ")); process.exitCode = 1; }
else console.log("integrity checks passed (P&L identities, BS totals, row lengths)");

#!/usr/bin/env node
// Live-source smoke test. Run on any machine with normal internet (the build sandbox could not reach these hosts):
//   node scripts/smoke-live.mjs                 → checks the three upstream sources directly
//   node scripts/smoke-live.mjs http://localhost:3000   → also checks a running FINN (live mode) end to end
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const app = process.argv[2];
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, detail }); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, detail: e.message }); }
};
const get = async (url, headers = {}) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
};
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

await check("Yahoo EOD (RELIANCE.NS)", async () => {
  const j = await (await get("https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=3mo&interval=1d")).json();
  const r = j.chart.result[0];
  return `${r.timestamp.length} bars, last close ${r.indicators.quote[0].close.at(-1)}`;
});
await check("BSE announcements (500325)", async () => {
  const to = new Date(), from = new Date(Date.now() - 30 * 864e5);
  const j = await (await get(`https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?pageno=1&strCat=-1&strPrevDate=${ymd(from)}&strScrip=500325&strSearch=P&strToDate=${ymd(to)}&strType=C&subcategory=-1`, { Referer: "https://www.bseindia.com/", Origin: "https://www.bseindia.com", Accept: "application/json" })).json();
  return `${j.Table.length} filings, latest: ${j.Table[0]?.NEWSSUB?.slice(0, 70)}`;
});
await check("screener.in company page (TCS)", async () => {
  const html = await (await get("https://www.screener.in/company/TCS/consolidated/")).text();
  const has = ["section id=\"quarters\"", "section id=\"profit-loss\"", "section id=\"balance-sheet\"", "section id=\"cash-flow\"", "id=\"documents\"", "concall"].map((k) => `${k.split("\"")[1] ?? k}:${html.includes(k) ? "✓" : "✗"}`);
  return has.join(" ");
});
await check("screener.in search (bajaj)", async () => {
  const j = await (await get("https://www.screener.in/api/company/search/?q=bajaj&v=3&fts=1")).json();
  return `${j.length} hits, first ${j[0]?.url}`;
});
if (app) {
  await check("FINN /api/health", async () => JSON.stringify(await (await get(`${app}/api/health`)).json()));
  await check("FINN /api/briefing (live)", async () => { const b = await (await get(`${app}/api/briefing?window=168`)).json(); return `mode=${b.mode} items=${b.items.length} sources=${b.sources.map((s) => s.note).join(" | ")}`; });
  await check("FINN /api/research/TCS (outside snapshot)", async () => { const r = await (await get(`${app}/api/research/TCS`)).json(); return `snapshot=${r.snapshot.status} trajectory=${r.trajectory.status} cash=${r.cash.status} narrative=${r.narrative.status} tracks=${r.narrative.data.tracks.length} warnings=${r.warnings.join("; ")}`; });
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(40)} ${String(r.ms).padStart(5)}ms  ${r.detail}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;

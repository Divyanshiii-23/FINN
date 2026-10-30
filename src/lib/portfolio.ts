/** Mock portfolio: 15 NSE names across 13 sectors, mega-cap to mid-cap. Equal-weighted for portfolio-level stats. */
export const PORTFOLIO = [
  "RELIANCE", "HDFCBANK", "INFY", "BHARTIARTL", "ITC", "LT", "SUNPHARMA", "TATASTEEL",
  "ETERNAL", "BEL", "NTPC", "TITAN", "ASIANPAINT", "DIXON", "POLYCAB",
] as const;

/** Ad-hoc research demo set — Bajaj Finance is deliberately outside the portfolio. Research works for any NSE ticker. */
export const RESEARCH_DEMO = [
  { symbol: "INFY", why: "Explicit guidance, cut twice in FY27" },
  { symbol: "BAJFINANCE", why: "Outside the portfolio · lender metrics" },
  { symbol: "RELIANCE", why: "Segments, no numeric guidance" },
  { symbol: "POLYCAB", why: "Financials only (no dossier)" },
];

# Build log

Condensed log of decisions, work and verification, kept during the build (30 Oct 2026, single coding-agent session).

## Environment facts that shaped the build
- The build sandbox could not reach NSE, BSE, Yahoo, screener.in, any LLM API, or any deploy host from the shell. Only npm, PyPI and GitHub were reachable, and the GitHub token was invalid.
- A web reader *could* open pages surfaced by search, which included screener.in company pages and company IR PDFs. That is how the real snapshot was captured.
- **Consequence:** the live adapters were built against documented payload shapes and tested with fixtures and mocks. The demo runs on a recorded, identity-checked snapshot. Deployment and the live smoke test happen on the owner's machine.

## Decisions
1. **Single Next.js app, no Python service.** The Yahoo chart endpoint (which yfinance wraps) is callable from Node, so one deploy is enough.
2. **Rules before models for classification.** Exchange titles are formulaic. All 25 classifier rules were checked against ~80 real titles (see `tests/pipeline.test.ts`).
3. **Materiality = base prior + evidence deltas**, and each delta is shown to the user. Amounts are normalised by TTM revenue or existing borrowings.
4. **Clustering.** A results day (outcome, deck, press release, newspaper notice, dividend, call notice) becomes one card. Successive legal or leadership filings within 4 days become one thread.
5. **Snapshot "now" = capture time**, so the 24h window describes the same day the data does.
6. **Narrative vs Numbers is evaluated in code** from (guidance range, actual, scope). It handles FY verdicts, YTD tracking, implied H2, lower-is-better metrics, bps-improvement metrics and dual-basis numbers (e.g. credit cost with and without an overlay).
7. **Live extraction safeguards:**
   - Keyword-density page selection, so only 5 pages per transcript go to the model.
   - Zod-validated JSON.
   - Verbatim quote verification against the page text; failures are dropped and counted.
8. **The bull/bear reasoning model may cite only numbered evidence.** Citations are validated, with a rules fallback.
9. **Disabled Next 16 Cache Components.** Caching is explicit per source (fetch revalidate plus an in-process TTL).
10. **localStorage via `useSyncExternalStore`** for alert rules, which is hydration-safe and syncs across tabs.

## Data capture
- 16 companies (15 portfolio + Bajaj Finance) captured from screener.in into `data/raw/`, then compiled. **All P&L and balance-sheet identity checks pass.**
- Guidance evidence was captured from Infosys press releases, fact sheets and transcripts (Q2 FY26 → Q2 FY27), Bajaj Finance presentations and transcript (Q4 FY26, Q2 FY27), and the Reliance Q1 FY27 media release.
- One correction made during the build: exact dates had been guessed for 4 documents whose sources only gave a month. They were changed to month precision.

## Bugs found by inspecting real output (and fixed)
- **Date regex:** "November 2026" was being read as 20 November, producing a phantom event.
- **Duplicates:** a dividend reason was repeated on one card, and two NTPC commissioning headlines were identical.
- **Threading:** two Polycab NCLAT filings appeared as separate cards and are now one thread. An NTPC unnamed directorate change was over-ranked and now scores lower.
- **Claims:** Reliance's record-PAT claim (from a sibling press release) didn't reach the pending results card.
- **Credit-cost display:** the Bajaj Finance chart marker and verdict text used different bases.
- **Margins answer:** Asian Paints' Q2 margin compression was hidden by a two-quarter average. A latest-quarter fact was added.
- **Next 16 specifics:** `dynamic` export clashed with Cache Components; the Tailwind turbopack loader was dropped from the config; pages were statically prerendered and are now request-time; four `set-state-in-effect` lint errors fixed.

## Verification
- `npm test`: **53 tests**, covering:
  - % change edge cases (negative bases, sign flips, zero) and fiscal-quarter maths
  - anomaly maths, classifier labels on real titles, extractors
  - a hand-checked L&T results table and lender-specific rows
  - briefing ranking and windows, research verdicts for INFY and BAJFINANCE
  - the screener parser on a structural fixture, Yahoo/BSE adapters with mocked payloads, blocked-endpoint errors
  - per-source fallback in `auto` mode
- `tsc`, `eslint` and `next build` are clean.
- Headless Chromium screenshots of every page at 390 px and 1440 px: no console errors, layout fixes applied.
- Production server in `auto` mode inside the sandbox: live sources fail in under 0.1 s each and fall back per source, with warnings surfaced.

## Outstanding
- Run `npm run smoke` on a normal network to confirm the Yahoo, BSE and screener adapters against live hosts.
- Deploy (`vercel --prod`), then optionally add `GEMINI_API_KEY` to enable live transcript extraction for any ticker.

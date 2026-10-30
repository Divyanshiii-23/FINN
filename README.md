# FINN — Financial Investment Agent

A mobile-first investment-intelligence layer for a 15-stock Indian portfolio, built for the ENAM Holdings AI Engineer Build Challenge.

> **Don't show me everything that happened. Show me what changed, why it matters, and what deserves my attention.**

FINN has two modes:

- **Push — the Brief.** Every exchange filing across the portfolio is classified, scored for materiality *with the reasons shown*, clustered (a results day's five filings become one card), and ranked. Results get a QoQ/YoY first cut of Revenue, EBITDA, PBT and PAT. Management changes get a background on the incoming person. Routine paperwork is collapsed. Price/volume triggers and thresholds are yours to set.
- **Pull — Research.** Any NSE ticker → a structured report built from primary disclosures. Its centrepiece is **Narrative vs Numbers**: every explicit guidance range management gave, call by call, against what was later reported, with arithmetic verdicts and page-level citations.

---

## The point of view

1. **Numbers are computed, never generated.** Every % change, margin, CAGR, conversion ratio and verdict is deterministic TypeScript. The language model is only used where reading is required (transcripts, filing PDFs) and must quote the page it read — quotes are verified verbatim before they're accepted.
2. **Ranking you can argue with.** Each card shows *why* it ranks where it does (`+62 results filing · +16 PAT +27% YoY · +7 margin −133 bps`). A ₹2.14 lakh penalty on Bharti Airtel is buried because FINN divides it by revenue; Sun Pharma's ₹7,816 cr NCD is surfaced because it's 1.7× the company's existing borrowings.
3. **Every claim carries its kind.** `REPORTED` (disclosed), `CALC` (computed by FINN), `MGMT` (management's own claim), `AI` (interpretation). An unverified headline ("record Q2 PAT of ₹29,550 cr") is shown as a management claim, not as a number.
4. **Say what's missing.** If management gave no numeric guidance (Reliance), FINN says so rather than inferring one. If a data source is down, the page says which one, and the rest still works.

## What it found on 30 Oct 2026 (real data)

- **L&T Q2 FY27** — PAT +27.2% YoY on revenue +15.8%, but EBITDA margin −133 bps and other income = 30% of PBT → "core operations explain less of the profit than the headline suggests".
- **HDFC Bank** — MD & CEO transition (Anup Bagchi succeeds Sashidhar Jagdishan, effective 27 Oct), with a sourced background; scored down a notch because the succession was pre-announced.
- **Polycab** — two NCLAT filings in three days (insolvency matter; MSCI directed not to delist) threaded into one high-priority card.
- **Infosys (research)** — FY26 revenue guidance raised twice and delivered (3.1% vs 3–3.5%); FY27 guidance **cut twice** (1.5–3.5% → 1.5–3.0% → 1.0–2.0%) while management led with AI revenue (8.2% → 10.5%) and record deal TCV. H1 at 1.9% implies H2 growth of 0.1–2.1%. Margin band held at every call.
- **Bajaj Finance (outside the portfolio)** — AUM +26% vs 22–24% guided (ahead); opex/NTI improvement 13 bps in H1 vs 25–40 bps guided (behind); credit cost inside the corridor only once the ₹337 cr overlay the company excludes is added back.

---

## Architecture

```
            ┌────────────── sources (each falls back independently) ──────────────┐
            │ Yahoo chart API (EOD)   BSE announcements API   screener.in pages   │
            │        │                       │                    │ + PDFs       │
            │        └──── recorded snapshot (data/snapshot) ─────┘              │
            └──────────────────────────────┬───────────────────────────────────────┘
                                           │ CompanyData + Provenance per source
   PUSH                                    │                                  PULL
   classify (ordered rules, ~25)           │      metrics (deterministic): snapshot,
   score (base prior + evidence reasons)   │      trajectory, balance sheet, cash quality,
   cluster (results day, legal threads)    │      contradiction checks
   results table (QoQ/YoY)                 │      evidence: curated dossier  |  live:
   enrich (mgmt profile, upcoming dates)   │        transcripts → keyword page selection →
   anomalies (price ±X%, volume ×avg)      │        fast-model extraction → verbatim quote check
   digest (template, no LLM)               │      narrative evaluator: revisions, verdicts,
                                           │        implied run-rates, credibility, divergences
                                           │      bull/bear: rules, or reasoning model citing
                                           │        numbered evidence (citations validated)
                                           ▼
              Next.js route handlers (/api/*) + server-rendered pages (mobile-first UI)
```

| Module | Path |
|---|---|
| Data ingestion | `src/lib/sources/{yahoo,bse,screener,http,index}.ts` |
| Normalisation + snapshot compiler (with accounting-identity checks) | `scripts/build-snapshot.mjs`, `data/raw/` |
| Classification | `src/lib/pipeline/classify.ts` |
| Materiality scoring + interpretation | `src/lib/pipeline/score.ts`, `extract.ts` |
| Clustering, windows, alerts, digest | `src/lib/pipeline/briefing.ts`, `src/lib/finance/anomaly.ts` |
| Financial maths | `src/lib/finance/{change,quarters,results}.ts` |
| Document retrieval + extraction | `src/lib/research/live.ts` |
| Narrative vs Numbers | `src/lib/research/narrative.ts`, `data/research/*.json` |
| Research assembly / Ask FINN | `src/lib/research/{report,metrics,ask}.ts` |
| Model routing + cache | `src/lib/llm.ts` |
| API | `src/app/api/*` |
| UI | `src/app/*`, `src/components/*` |

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · cheerio · unpdf · zod · vitest. One deployable unit — no separate Python service, no database, no vector store. Hand-built SVG charts (no chart library).

### Model routing (cost)

| Step | Engine | Why |
|---|---|---|
| All arithmetic, verdicts, ranking, digest | Code | Must be exact and free |
| Classification | Ordered regex rules + exchange category | Titles are formulaic; a model adds cost and variance, not accuracy |
| Transcript → guidance JSON | **Fast tier** (`gemini-3.5-flash-lite`) | High volume structured extraction; only the 5 most guidance-dense pages per call are sent |
| Bull/bear, Ask FINN synthesis | **Reasoning tier** (`gemini-3.8-flash`) | Low volume; must cite numbered evidence, citations validated |

Prompts and outputs are cached by content hash; reports are cached for 30 minutes; upstream fetches use per-source TTLs. A full research run on a new ticker is ~4 fast calls + 1 reasoning call. Providers are swappable by env var (Gemini → Groq → OpenAI → Anthropic). The Gemini free tier covers it.

---

## Run it

```bash
npm install
cp .env.example .env.local      # optional: add GEMINI_API_KEY
npm run dev                     # http://localhost:3000
npm test                        # 53 tests: maths, classifier on real titles, parser fixture, adapters, fallback
npm run smoke                   # checks Yahoo / BSE / screener reachability from your machine
npm run smoke -- http://localhost:3000   # + end-to-end check of a running FINN in live mode
```

### Deploy (Vercel, free tier)

```bash
npm i -g vercel
vercel --prod                    # framework auto-detected; no config needed
vercel env add GEMINI_API_KEY    # optional, then redeploy
```

Any Node host works (`npm run build && npm start`). If a host's IPs are blocked by BSE or Yahoo, FINN degrades per source to the snapshot and says so in the UI.

### Environment

| Variable | Default | Effect |
|---|---|---|
| `FINN_DATA_MODE` | `auto` | `auto` live→snapshot per source · `snapshot` offline · `live` no fallback |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Enables live transcript extraction, LLM bull/bear, Ask FINN synthesis |
| `FINN_MODEL_FAST`, `FINN_MODEL_REASONING` | per provider | Model overrides |

## Data sources

| Data | Live source | Snapshot |
|---|---|---|
| EOD price & volume | Yahoo Finance chart API (`.NS`) — the endpoint behind yfinance | Last quote shown on screener.in (some intraday, labelled); no history |
| Filings | BSE corporate-announcements API; fallback: screener.in filing list (links to BSE PDFs) | Recent filings per company, BSE PDF links |
| Fundamentals | screener.in company page (quarterly, P&L, balance sheet, cash flow, ratios, documents) | Same, captured 30 Oct 2026 23:30 IST, all tables pass P&L/BS identity checks |
| Guidance & commentary | Earnings-call transcripts & investor presentations (BSE/NSE/IR PDFs) | Curated evidence for INFY, BAJFINANCE, RELIANCE with document, date, page/section, URL |
| Management backgrounds (push only) | Filing's Reg-30 profile (live, via LLM) | Sourced profile for the HDFC Bank CEO change |

**The snapshot is real, not synthetic.** The build sandbox had no route to NSE/BSE/Yahoo, so data was captured through a web reader from screener.in and company IR sites, compiled by `scripts/build-snapshot.mjs`, and checked: Sales − Expenses = Operating Profit, OP + OI − Interest − Dep = PBT, and balance-sheet totals, for every company and period. Announcement titles may be condensed; every one links to its BSE PDF.

## Known limitations

- **Live adapters are unit-tested against fixtures and mocked payloads, but could not be exercised against the real hosts from the build sandbox.** Run `npm run smoke` once on a normal network; the screener parser is the piece most exposed to markup changes.
- Snapshot mode has no price history, so **volume alerts only fire in live mode**.
- Screener's EBITDA (operating profit before other income) can differ from a company's own "EBITDA" definition (e.g. Reliance includes other income). The definition is stated next to every table.
- Revenue guidance in **constant currency** is compared with INR-reported growth in live mode (flagged in the UI); curated dossiers use the company's own cc figures.
- Reliance's 30 Oct Q2 FY27 numbers weren't standardised in time; the card shows the company's headline claim as unverified and leaves the table pending.
- No auth and no server-side alert delivery: rules live in the browser, and notifications fire when the app is opened. Real push needs a scheduled job plus web-push, which is listed under next steps.

## Deliberately left out

Intraday data, a news feed, broker estimates, price targets, a vector database, user accounts, and portfolio P&L with position sizes. Each would add surface area without improving the core question: *what changed and does it matter?*

## Next

Scheduled ingestion every 15 minutes with web-push. Guidance extraction over investor presentations as well as transcripts. Segment-level actuals for Narrative vs Numbers. A results-surprise model against the company's own trend. Credibility scores accumulated per management team across years.

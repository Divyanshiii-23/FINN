**To:** assessment@enam.com
**Subject:** ENAM - IIT screening - 2027

Hello ENAM team,

Please find my submission for the FINN build challenge.

- **Prototype (mobile-first):** <DEPLOYED_URL>
- **Repository:** <GITHUB_URL>
- **AI build history:** <CLAUDE_SHARE_LINK> (the full coding-agent session, including planning, data capture, debugging and QA)

**What I built**

FINN treats a day's filings as a briefing. It is not a dashboard.

*Push.* Every filing across a 15-stock portfolio is classified and given a materiality score. Each score shows its reasons: "+16 PAT +27% YoY", "−30 penalty is <0.01% of revenue". Results-day filings collapse into one card, and successive filings on the same legal matter collapse into one thread. Results get a QoQ/YoY first cut of Revenue, EBITDA, PBT and PAT, computed in code. Management changes come with a sourced background on the incoming person. Routine paperwork is hidden but stays one tap away. The digest window (24h / 3d / 7d / 30d) is selectable. Price and volume thresholds, announcement types and the materiality bar are all user-set.

*Pull.* Any NSE ticker gets a report built only from primary disclosures. Five sections are pure arithmetic: snapshot, trajectory, balance sheet, cash quality, and contradiction checks. The centrepiece is **Narrative vs Numbers**. It takes every explicit guidance range management gave, call by call, and sets it against what was reported. It also shows revision paths, the implied second-half run-rate, a record-based credibility summary, and "story vs numbers" divergences.

On Infosys, it shows FY26 guidance raised twice and delivered, then FY27 cut twice (3.5% → 3.0% → 2.0% at the top end), while management led with AI revenue and record deal wins. On Bajaj Finance, which is deliberately outside the portfolio, it shows AUM growth ahead of guidance and operating leverage behind. Credit cost is inside the guided corridor only once the overlay the company excludes is added back.

**Key decisions**

- **Code does the maths; the model only reads.** Every number and verdict is deterministic. The LLM extracts guidance from transcripts, and every quote it returns must be found verbatim on the cited page or it is dropped.
- **Model routing.** Regex rules handle classification, because filing titles are formulaic. A cheap model does extraction, sending only the 5 most guidance-dense pages per transcript. A stronger model handles synthesis, and may only cite numbered evidence. Everything is cached. The Gemini free tier is enough.
- **Provenance everywhere.** Every number is tagged Reported / Calc / Mgmt / AI and links to its document and page. Each data source shows whether it is live or from the snapshot.
- **Fail per source, never silently.** Prices, filings and fundamentals each fall back independently, and the UI names whatever is missing.

**Trade-offs and what I left out**

- My build environment had no network route to NSE, BSE or Yahoo. So the demo runs on a **real recorded snapshot**, captured on 30 Oct 2026 and checked against accounting identities. The live adapters are tested against fixtures, and a smoke script verifies them on a normal network.
- Volume alerts need live price history. Reliance's results filed on 30 Oct appear as a card with numbers pending, and the company's headline is labelled as an unverified claim.
- I left out intraday data, news, broker estimates, user accounts and server-side push. None of them make "what changed, and does it matter?" any better.

**Next**

- Scheduled ingestion with web-push.
- Guidance extraction from investor presentations as well as transcripts.
- Segment-level actuals in Narrative vs Numbers.
- Per-management credibility tracked across years.

Thank you for your time.

Divyanshi Agnihotri
B.Tech, Biological Sciences & Bioengineering, IIT Kanpur
divyanshi23@iitk.ac.in

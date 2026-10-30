import { describe, expect, it } from "vitest";
import { classify } from "@/lib/pipeline/classify";
import { inrAmountCr, datesIn, roleFrom, namesFrom } from "@/lib/pipeline/extract";
import { buildResultsTable } from "@/lib/finance/results";
import { getCompany } from "@/lib/sources";
import { buildBriefing, inWindow } from "@/lib/pipeline/briefing";

const c = (t: string) => { const r = classify(t); return `${r.category}/${r.subtype}`; };

describe("classifier on real filing titles", () => {
  it.each([
    ["Unaudited Financial Results (Consolidated And Standalone) For The Quarter And Half Year Ended September 30, 2026", "results/filing"],
    ["Board Meeting Outcome For Unaudited Financial Results and Issuance of Non-Convertible Debentures", "results/outcome"],
    ["Investor Presentation on Q2 and H1 FY27 unaudited results", "results/presentation"],
    ["Press Release: record Q2 FY27 PAT of ₹29,550 crore; Jio IPO completed", "results/press_release"],
    ["Newspaper Publication - Intimation re publication of Financial Results in Newspapers", "results/newspaper"],
    ["Board meeting postponed to November 7, 2026 for Q2 and half-year results approval", "results/postponed"],
    ["Board meeting on 5 Nov 2026 to approve Q2 and half-year FY27 unaudited results", "results/intimation"],
    ["Change in MD and CEO: Sashidhar Jagdishan steps down; Anup Bagchi becomes MD and CEO from Oct 27, 2026", "management_change/change"],
    ["Change in Management - Prashant Verma re-appointed CISO from 1 February 2027 for three years", "management_change/reappointment"],
    ["Allotment of ESOP/ESPS: 46,75,598 equity shares on ESOP/RSU exercise", "unclassified/routine"],
    ["Compliances-Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018", "unclassified/routine"],
    ["Analyst/Investor Meet Outcome: Q2 FY27 earnings call transcript released", "earnings_call/transcript"],
    ["Analyst / Investor Meet - Intimation", "investor_meetings/intimation"],
    ["DoT Karnataka imposed Rs 2.14 lakh penalty on Airtel for alleged subscriber verification norm violations", "litigation/penalty"],
    ["CIRP Updates: NCLAT allowed Polycab's appeal and set aside NCLT Ahmedabad order (Oct 30, 2026)", "litigation/insolvency"],
    ["Press Release: BEL received additional orders worth Rs. 1,011 crore since 13 October 2026", "press_release/order_win"],
    ["Allotment of ₹7,816 crore Non-Convertible Debentures, maturing 27 October 2031", "fund_raise/debt"],
    ["Acquisition: Titan Company Canada Inc. wholly owned subsidiary incorporated 27 Oct 2026 with CAD 5,000", "M&A/subsidiary"],
    ["Disclosure Under Regulation 30 - Voluntary Strike Off Of Hamleys (Franchising) Limited", "M&A/strike_off"],
    ["Declaration of COD of 95.6 MW Kalasar Solar Energy Project, Bikaner, Rajasthan (fifth part capacity)", "capex/commissioning"],
    ["Disclosures under Reg. 29(2) of SEBI (SAST) Regulations, 2011", "insider_trading/disclosure"],
    ["Dividend Updates - Q2 FY27 results, Rs 5.75 interim dividend", "dividend/dividend"],
    ["ILUMYA (tildrakizumab-asmm) approved in the U.S. for adults with active Psoriatic Arthritis", "press_release/regulatory_approval"],
    ["Newspaper Publication - Advertisement published Oct 30, 2026 w.r.t Postal Ballot", "postal_ballot/notice"],
    ["ESG Rating By Crisil ESG Ratings & Analytics Ltd", "unclassified/routine"],
  ])("%s", (title, expected) => expect(c(title)).toBe(expected));
});

describe("extractors", () => {
  it("amounts in crore", () => {
    expect(inrAmountCr("orders worth Rs. 1,011 crore since")).toBe(1011);
    expect(inrAmountCr("Rs 2.14 lakh penalty")).toBeCloseTo(0.0214);
    expect(inrAmountCr("₹7,816 crore NCDs")).toBe(7816);
  });
  it("dates", () => {
    expect(datesIn("postponed to November 7, 2026 for", 2026)).toContain("2026-11-07");
    expect(datesIn("call on 3 November 2026 at 4:00", 2026)).toContain("2026-11-03");
    expect(datesIn("Board meeting on 5 Nov 2026", 2026)).toContain("2026-11-05");
  });
  it("roles and names", () => {
    expect(roleFrom("Change in MD and CEO").role).toBe("MD & CEO");
    expect(roleFrom("re-appointed CISO").seniority).toBe("kmp");
    expect(namesFrom("Sashidhar Jagdishan steps down; Anup Bagchi becomes MD and CEO")).toEqual({ outgoing: "Sashidhar Jagdishan", incoming: "Anup Bagchi" });
  });
});

describe("results table (L&T Q2 FY27, hand-checked)", async () => {
  const { company } = await getCompany("LT");
  const t = buildResultsTable(company!, "Sep 2026")!;
  it("QoQ and YoY", () => {
    const rev = t.rows.find((r) => r.metric === "Revenue")!;
    const pat = t.rows.find((r) => r.metric === "PAT")!;
    expect([rev.current, rev.prev, rev.yoy]).toEqual([78750, 67942, 67984]);
    expect(rev.qoq.pct).toBe(15.9); // 78750/67942-1
    expect(rev.yoyChange.pct).toBe(15.8);
    expect([pat.current, pat.prev, pat.yoy]).toEqual([5949, 4988, 4678]);
    expect(pat.yoyChange.pct).toBe(27.2);
    expect(t.margin!.current!.toFixed(2)).toBe("11.19"); // 8814/78750
  });
  it("lenders get no EBITDA", async () => {
    const { company: hdfc } = await getCompany("HDFCBANK");
    const tb = buildResultsTable(hdfc!, "Sep 2026")!;
    expect(tb.rows.find((r) => r.metric === "EBITDA")!.notMeaningful).toBeTruthy();
    expect(tb.rows.find((r) => r.metric === "NII")!.current).toBe(95132 - 50667);
  });
});

describe("briefing (snapshot)", async () => {
  const b = await buildBriefing(24);
  it("ranks and filters", () => {
    expect(b.mode).toBe("snapshot");
    expect(b.items.length).toBeGreaterThan(0);
    for (let i = 1; i < b.items.length; i++) expect(["high","medium","low"].indexOf(b.items[i - 1].tier)).toBeLessThanOrEqual(["high","medium","low"].indexOf(b.items[i].tier));
    expect(b.routine.every((r) => r.tier === "routine")).toBe(true);
  });
  it("prints the feed for inspection", () => {
    console.log(b.digest.join("\n"));
    for (const i of b.items) console.log(`${i.tier.padEnd(6)} ${String(i.score).padStart(3)} ${i.symbol.padEnd(11)} ${i.category.padEnd(18)} ${i.headline}  [${i.reasons.map((r) => `${r.delta > 0 ? "+" : ""}${r.delta} ${r.text}`).join(" | ")}]${i.related.length ? ` (+${i.related.length} related)` : ""}`);
    console.log("ROUTINE:", b.routine.map((r) => `${r.symbol}:${r.title.slice(0, 40)}`).join(" · "));
    console.log("UPCOMING:", b.upcoming.map((u) => `${u.symbol} ${u.label} ${u.date}`).join(" · "));
    console.log("MARKET:", b.market.map((m) => `${m.symbol} ${m.text}`).join(" · "));
  });
  it("7-day window surfaces more", async () => {
    const w = await buildBriefing(168);
    expect(w.items.length).toBeGreaterThan(b.items.length);
  });
  it("window maths", () => {
    const ref = new Date("2026-10-30T23:30:00+05:30");
    expect(inWindow({ date: "2026-10-29" }, ref, 24)).toBe(true);
    expect(inWindow({ date: "2026-10-28" }, ref, 24)).toBe(false);
    expect(inWindow({ date: "2026-10-29", time: "22:00" }, ref, 24)).toBe(false);
  });
});

describe("date regression", () => {
  it("does not read the year as a day", () => {
    expect(datesIn("results conference call on 3 November 2026 at 4:00 p.m.", 2026)).toEqual(["2026-11-03"]);
    expect(datesIn("Board meeting on 5 Nov 2026 to approve", 2026)).toEqual(["2026-11-05"]);
  });
});

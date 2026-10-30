import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/research/report";

describe("research reports", () => {
  it("INFY narrative vs numbers", async () => {
    const r = (await buildReport("INFY"))!;
    expect(r.narrative.status).toBe("ok");
    const fy27 = r.narrative.data.tracks.find((t) => t.key === "FY27:revenue_growth_cc")!;
    expect(fy27.revision.direction).toBe("lowered");
    expect(fy27.verdict.code).toBe("tracking_within"); // H1 1.9% inside 1-2%
    const fy26 = r.narrative.data.tracks.find((t) => t.key === "FY26:revenue_growth_cc")!;
    expect(fy26.verdict.code).toBe("met");
    expect(fy26.revision.direction).toBe("raised");
    for (const t of r.narrative.data.tracks) console.log(`${t.key.padEnd(30)} ${t.verdict.code.padEnd(16)} ${t.verdict.text} | ${t.revision.text} | ${t.derivations.map((d) => d.label + ": " + d.value).join("; ")}`);
    console.log("CRED", r.narrative.data.credibility.map((c) => `${c.label}: ${c.value}`));
    console.log("DIV", r.narrative.data.divergences.map((c) => `${c.label}: ${c.value}`));
    console.log("SNAP", r.snapshot.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
    console.log("TRAJ", r.trajectory.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
    console.log("CASH", r.cash.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
    console.log("FLAGS", r.contradictions.data.items.map((f) => `${f.label}=${f.value}`).join(" | "));
    console.log("BULL", r.bullBear.data.bull.map((f) => f.label).join(" | "), "\nBEAR", r.bullBear.data.bear.map((f) => f.label).join(" | "));
  });
  it("BAJFINANCE", async () => {
    const r = (await buildReport("BAJFINANCE"))!;
    for (const t of r.narrative.data.tracks) console.log(`${t.key.padEnd(34)} ${t.verdict.code.padEnd(16)} ${t.verdict.text} | ${t.derivations.map((d) => d.label + ": " + d.value).join("; ")}`);
    expect(r.cash.status).toBe("unavailable");
    console.log("BAJ BAL", r.balanceSheet.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
  });
  it("RELIANCE + POLYCAB + unknown", async () => {
    const r = (await buildReport("RELIANCE"))!;
    expect(r.narrative.data.guidanceNote).toBeTruthy();
    console.log("RIL", r.narrative.status, r.guidance.status, "| FLAGS", r.contradictions.data.items.map((f) => `${f.label}=${f.value}`).join(" | "));
    console.log("RIL CASH", r.cash.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
    const p = (await buildReport("POLYCAB"))!;
    console.log("POLY", p.narrative.status, p.narrative.note, p.trajectory.status, p.trajectory.data.facts.map((f) => `${f.label}=${f.value}`).join(" | "));
    expect(await buildReport("ZZZNOTREAL")).toBeNull();
  });
});

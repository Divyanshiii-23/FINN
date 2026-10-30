import { describe, expect, it } from "vitest";
import { pctChange, cagr, bps } from "@/lib/finance/change";
import { fiscalLabel, quarterReportedOn, shiftQuarter } from "@/lib/finance/quarters";
import { lastDayMove, volumeMultiple } from "@/lib/finance/anomaly";

describe("pctChange", () => {
  it("plain growth / decline", () => {
    expect(pctChange(110, 100)).toMatchObject({ pct: 10, display: "+10%", direction: "up" });
    expect(pctChange(90, 100)).toMatchObject({ pct: -10, direction: "down" });
  });
  it("missing / zero base", () => {
    expect(pctChange(null, 100).display).toBe("—");
    expect(pctChange(5, 0).display).toBe("n.m.");
  });
  it("sign flips are described, never given a misleading %", () => {
    expect(pctChange(50, -20)).toMatchObject({ pct: null, display: "Turned positive", direction: "up" });
    expect(pctChange(-50, 20)).toMatchObject({ pct: null, display: "Turned negative", direction: "down" });
  });
  it("both negative uses the absolute base", () => {
    const c = pctChange(-50, -100);
    expect(c.display).toBe("Loss narrowed");
    expect(c.pct).toBe(50);
    expect(pctChange(-150, -100).display).toBe("Loss widened");
  });
  it("Tata Steel Sep 2023 loss vs Sep 2024 profit", () => {
    expect(pctChange(759, -6511).display).toBe("Turned positive");
  });
  it("cagr / bps", () => {
    expect(cagr(100, 121, 2)!.toFixed(2)).toBe("10.00");
    expect(cagr(-5, 10, 3)).toBeNull();
    expect(bps(21.1, 21.0)).toBe(10);
  });
});

describe("quarters", () => {
  it("fiscal labels (Apr–Mar)", () => {
    expect(fiscalLabel("Sep 2026")).toBe("Q2 FY27");
    expect(fiscalLabel("Mar 2026")).toBe("Q4 FY26");
    expect(fiscalLabel("Dec 2025")).toBe("Q3 FY26");
    expect(fiscalLabel("Jun 2026")).toBe("Q1 FY27");
  });
  it("shift + reported quarter", () => {
    expect(shiftQuarter("Sep 2026", -1)).toBe("Jun 2026");
    expect(shiftQuarter("Sep 2026", -4)).toBe("Sep 2025");
    expect(shiftQuarter("Mar 2026", 1)).toBe("Jun 2026");
    expect(quarterReportedOn("2026-10-30")).toBe("Sep 2026");
    expect(quarterReportedOn("2026-07-17")).toBe("Jun 2026");
    expect(quarterReportedOn("2026-05-04")).toBe("Mar 2026");
    expect(quarterReportedOn("2026-01-14")).toBe("Dec 2025");
  });
});

describe("EOD anomalies", () => {
  const bars = Array.from({ length: 25 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, close: 100, volume: 1000 }));
  it("volume multiple excludes the bar under test from its own baseline", () => {
    const h = [...bars.slice(0, 24), { date: "2026-10-25", close: 104, volume: 3000 }];
    expect(volumeMultiple(h, 20)!.multiple).toBe(3);
    expect(lastDayMove(h)!.pct).toBeCloseTo(4);
  });
  it("needs enough history", () => {
    expect(volumeMultiple(bars.slice(0, 5), 20)).toBeNull();
  });
});

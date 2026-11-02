import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseScreenerHtml } from "@/lib/sources/screener";

describe("screener parser (structural fixture)", () => {
  const html = readFileSync("tests/fixtures/screener-sample.html", "utf8");
  const c = parseScreenerHtml(html, "TCS", "https://www.screener.in/company/TCS/consolidated/", new Date("2026-10-30T12:00:00Z"));
  it("tables, codes, documents", () => {
    expect(c.name).toBe("Tata Consultancy Services Ltd");
    expect(c.bse).toBe("532540");
    expect(c.quarters.headers).toEqual(["Jun 2025", "Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026"]);
    expect(c.quarters.rows.Sales).toEqual([63437, 65799, 66000, 67100, 68200]);
    expect(c.quarters.rows["Net Profit"]?.[0]).toBe(12760);
    expect(c.quarters.rows["Raw PDF"]).toBeUndefined();
    expect(c.annual!.headers).toEqual(["Mar 2025", "Mar 2026"]); // TTM column dropped
    expect(c.annual!.pl.Sales).toEqual([255324, 262336]);
    expect(c.annual!.bs.Borrowings).toEqual([8021, 9000]);
    expect(c.price).toBe(3128);
    expect(c.announcements[0]).toMatchObject({ date: "2026-10-09", title: "Financial Results For Q2 FY27" });
    expect(c.concalls[0]).toEqual({ period: "Oct 2026", transcript: "https://www.bseindia.com/t.pdf", ppt: "https://www.bseindia.com/p.pdf" });
    expect(c.annualReports[0].year).toBe("2026");
  });
});

describe("live adapters with mocked network", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("Yahoo chart payload → bars, change, volume", async () => {
    const ts = Array.from({ length: 22 }, (_, i) => 1790000000 + i * 86400);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ chart: { result: [{ meta: { currentTradingPeriod: { regular: { start: 0, end: 1 } } }, timestamp: ts, indicators: { quote: [{ close: ts.map((_, i) => 100 + i), volume: ts.map((_, i) => (i === 21 ? 5000 : 1000)) }] } }] } }))));
    const { yahooPrice } = await import("@/lib/sources/yahoo");
    const p = await yahooPrice("MOCKYF");
    expect(p.kind).toBe("close");
    expect(p.value).toBe(121);
    expect(p.changePct).toBeCloseTo((121 / 120 - 1) * 100);
    const { volumeMultiple } = await import("@/lib/finance/anomaly");
    expect(volumeMultiple(p.history!, 20)!.multiple).toBe(5);
  });
  it("BSE announcements payload → normalised filings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Table: [{ NEWSSUB: "Outcome of Board Meeting - Financial Results", DT_TM: "2026-10-30T19:45:12.987", ATTACHMENTNAME: "abc.pdf", CATEGORYNAME: "Result", SUBCATNAME: "Financial Results", MORE: "Board approved results" }] }))));
    const { bseAnnouncements } = await import("@/lib/sources/bse");
    const a = await bseAnnouncements("999999");
    expect(a[0]).toMatchObject({ date: "2026-10-30", time: "19:45", url: "https://www.bseindia.com/xml-data/corpfiling/AttachLive/abc.pdf", sourceCategory: "Result / Financial Results" });
  });
  it("blocked endpoints raise a typed error (no silent empty data)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Access denied</html>", { status: 200 })));
    const { bseAnnouncements } = await import("@/lib/sources/bse");
    await expect(bseAnnouncements("888888")).rejects.toThrow(/invalid JSON/);
  });
});

describe("auto mode falls back per source", () => {
  it("live sources unreachable → snapshot, with provenance saying so", async () => {
    vi.stubEnv("FINN_DATA_MODE", "auto");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    const { getCompany } = await import("@/lib/sources");
    const t0 = Date.now();
    const { company, report } = await getCompany("INFY");
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(company!.provenance.fundamentals.mode).toBe("snapshot");
    expect(company!.provenance.price.mode).toBe("snapshot");
    expect(report.failures.join(" ")).toMatch(/screener|Yahoo|BSE/);
    const unknown = await getCompany("NOTAREALCO");
    expect(unknown.company).toBeNull();
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });
});

describe("screener chart fallback", () => {
  it("parses price + volume datasets", async () => {
    const { parseScreenerChart } = await import("@/lib/sources/screener");
    const bars = parseScreenerChart({ datasets: [
      { metric: "Price", values: [["2026-10-29", "1167.40"], ["2026-10-30", "1165.00"]] },
      { metric: "Volume", values: [["2026-10-29", 14722247, { delivery: 50 }], ["2026-10-30", 9000000]] },
    ] });
    expect(bars).toEqual([{ date: "2026-10-29", close: 1167.4, volume: 14722247 }, { date: "2026-10-30", close: 1165, volume: 9000000 }]);
  });
  it("company ids are read from the page", async () => {
    const { parseScreenerHtml } = await import("@/lib/sources/screener");
    const c = parseScreenerHtml('<div id="company-info" data-company-id="2726" data-warehouse-id="6598251"></div><a href="/company/source/quarter/2726/6/2026/">x</a>', "RELIANCE", "u");
    expect(c.ids).toEqual(["2726", "6598251"]);
  });
});

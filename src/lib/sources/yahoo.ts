import type { PriceBar, PriceInfo } from "../types";
import { cached, getJson, SourceError } from "./http";

interface ChartResponse {
  chart: {
    result?: {
      meta: { regularMarketPrice?: number; currentTradingPeriod?: { regular?: { start: number; end: number } } };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[]; volume: (number | null)[] }[] };
    }[];
    error?: { description?: string } | null;
  };
}

const istDate = (epochSec: number) => new Date(epochSec * 1000 + 5.5 * 3600e3).toISOString().slice(0, 10);

/**
 * End-of-day bars from Yahoo's chart endpoint (the same data yfinance uses), NSE listing (.NS).
 * If the session is still open, the last bar is marked intraday — it is shown as such and excluded
 * from the volume test (a partial day would understate volume).
 */
export async function yahooPrice(symbol: string): Promise<PriceInfo> {
  return cached(`yahoo:${symbol}`, 15 * 60e3, async () => {
    // Yahoo rate-limits (HTTP 429) unauthenticated callers; try both hosts before giving up.
    let j: ChartResponse | null = null, lastErr: unknown;
    for (const host of ["query1", "query2"]) {
      try {
        j = await getJson<ChartResponse>(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?range=3mo&interval=1d`, "Yahoo Finance", { revalidate: 900 });
        break;
      } catch (e) { lastErr = e; }
    }
    if (!j) throw lastErr;
    const r = j.chart?.result?.[0];
    if (!r?.timestamp?.length) throw new SourceError("Yahoo Finance", j.chart?.error?.description ?? "no data for ticker");
    const q = r.indicators.quote[0];
    const bars: PriceBar[] = r.timestamp
      .map((t, i) => ({ date: istDate(t), close: q.close[i] as number, volume: q.volume[i] ?? null }))
      .filter((b) => b.close != null);
    const end = r.meta.currentTradingPeriod?.regular?.end;
    const open = end ? Date.now() / 1000 < end && istDate(end) === bars[bars.length - 1]?.date : false;
    const last = bars[bars.length - 1], prev = bars[bars.length - 2];
    return {
      value: last.close,
      changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
      date: last.date,
      kind: open ? "intraday" : "close",
      asOfText: open ? `${last.date} (session open — intraday)` : `${last.date} close`,
      history: open ? bars.slice(0, -1).concat([{ ...last, volume: null }]) : bars,
    };
  });
}

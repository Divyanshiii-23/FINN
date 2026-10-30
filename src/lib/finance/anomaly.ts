import type { PriceBar } from "../types";

export interface AlertRules {
  priceMovePct: number; // absolute daily move threshold, e.g. 3
  volumeMultiple: number; // e.g. 2 (× the trailing average)
  volumeLookback: number; // trading days in the average, e.g. 20
  minScore: number; // minimum materiality score for announcement alerts
  categories: string[]; // categories that can raise an alert
  symbols: string[]; // empty = whole portfolio
}

export const DEFAULT_RULES: AlertRules = {
  priceMovePct: 3,
  volumeMultiple: 2,
  volumeLookback: 20,
  minScore: 60,
  categories: ["results", "M&A", "management_change", "fund_raise", "litigation", "credit_rating", "pledging", "bonus_split", "capex"],
  symbols: [],
};

/** Daily % change of the last bar vs the previous close. */
export function lastDayMove(history: PriceBar[]): { pct: number; date: string } | null {
  if (history.length < 2) return null;
  const a = history[history.length - 2], b = history[history.length - 1];
  if (!a.close) return null;
  return { pct: ((b.close - a.close) / a.close) * 100, date: b.date };
}

/**
 * Volume on the last bar as a multiple of the average of the `lookback` bars *before* it
 * (the bar under test is excluded so a spike does not dilute its own baseline).
 */
export function volumeMultiple(history: PriceBar[], lookback = 20): { multiple: number; avg: number; date: string; volume: number } | null {
  const withVol = history.filter((b) => b.volume != null && b.volume > 0);
  if (withVol.length < Math.min(lookback, 10) + 1) return null;
  const last = withVol[withVol.length - 1];
  const base = withVol.slice(-(lookback + 1), -1);
  const avg = base.reduce((s, b) => s + (b.volume as number), 0) / base.length;
  if (!avg) return null;
  return { multiple: (last.volume as number) / avg, avg, date: last.date, volume: last.volume as number };
}

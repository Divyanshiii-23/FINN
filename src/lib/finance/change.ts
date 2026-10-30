import type { Change } from "../types";

/**
 * Period-over-period change with careful handling of the cases naive % maths gets wrong:
 *  - missing data → "—"
 *  - base of zero → "n.m." (not meaningful)
 *  - sign flips → described in words ("Turned profitable", "Swung to loss") with no %
 *  - both negative → % computed on the absolute base, described as loss narrowing/widening
 */
export function pctChange(current: number | null | undefined, base: number | null | undefined): Change {
  if (current == null || base == null || !Number.isFinite(current) || !Number.isFinite(base)) return { pct: null, display: "—", direction: "na" };
  if (base === 0) return { pct: null, display: "n.m.", direction: "na", note: "Base period is zero" };
  if (base < 0 && current >= 0) return { pct: null, display: "Turned positive", direction: "up", note: "Base period was negative" };
  if (base > 0 && current < 0) return { pct: null, display: "Turned negative", direction: "down", note: "Current period is negative" };
  const pct = ((current - base) / Math.abs(base)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const direction = Math.abs(rounded) < 0.05 ? "flat" : rounded > 0 ? "up" : "down";
  if (base < 0 && current < 0) {
    return { pct: rounded, display: current > base ? "Loss narrowed" : current < base ? "Loss widened" : "Unchanged", direction, note: `${fmtSigned(rounded)} vs a negative base` };
  }
  return { pct: rounded, display: fmtSigned(rounded), direction };
}

export function fmtSigned(pct: number, digits = 1): string {
  const v = Math.abs(pct) >= 100 ? Math.round(pct) : Number(pct.toFixed(digits));
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: digits })}%`;
}

/** Margin (ratio) in % or null. */
export function ratio(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
}

/** Difference between two percentages, in basis points. */
export function bps(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((a - b) * 100);
}

/** Compound annual growth rate in %, or null when not meaningful (non-positive endpoints). */
export function cagr(first: number | null | undefined, last: number | null | undefined, years: number): number | null {
  if (first == null || last == null || years <= 0 || first <= 0 || last <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

export function sum(vals: (number | null | undefined)[]): number | null {
  if (!vals.length || vals.some((v) => v == null)) return null;
  return (vals as number[]).reduce((a, b) => a + b, 0);
}

export function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

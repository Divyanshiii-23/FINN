"use client";
import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_RULES, type AlertRules } from "./finance/anomaly";
import type { FeedItem, Holding, MarketAlert } from "./types";

const KEY = "finn.rules.v1";
const SEEN = "finn.lastSeen.v1";

// localStorage as an external store: hydration-safe (server snapshot = defaults) and synced across tabs.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
const read = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } emit(); };
const noop = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useRules(): [AlertRules, (r: AlertRules) => void, boolean] {
  const raw = useSyncExternalStore(subscribe, () => read(KEY), () => "");
  const hydrated = useHydrated();
  const rules = useMemo<AlertRules>(() => {
    if (!raw) return DEFAULT_RULES;
    try { return { ...DEFAULT_RULES, ...JSON.parse(raw) }; } catch { return DEFAULT_RULES; }
  }, [raw]);
  return [rules, (r) => write(KEY, JSON.stringify(r)), hydrated];
}

/** "New since your last visit" — stored per browser. */
export function useLastSeen(): [string | null, () => void] {
  const seen = useSyncExternalStore(subscribe, () => read(SEEN), () => "");
  return [seen || null, () => { try { localStorage.setItem(SEEN, new Date().toISOString()); } catch { /* ignore */ } }];
}

export function useNotificationPermission(): [NotificationPermission | "unsupported", () => Promise<void>] {
  const perm = useSyncExternalStore(subscribe, () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission), () => "default" as const);
  return [perm, async () => { if (typeof Notification !== "undefined") { await Notification.requestPermission(); emit(); } }];
}

export function matchesRules(i: FeedItem, r: AlertRules): boolean {
  if (r.symbols.length && !r.symbols.includes(i.symbol)) return false;
  return r.categories.includes(i.category) && i.score >= r.minScore;
}

export function marketFromHoldings(holdings: Holding[], r: AlertRules): MarketAlert[] {
  const out: MarketAlert[] = [];
  for (const h of holdings) {
    if (r.symbols.length && !r.symbols.includes(h.symbol)) continue;
    const p = h.price;
    if (!p) continue;
    const hist = p.history;
    const pct = hist && hist.length >= 2 ? ((hist[hist.length - 1].close - hist[hist.length - 2].close) / hist[hist.length - 2].close) * 100 : p.changePct;
    if (pct != null && Math.abs(pct) >= r.priceMovePct)
      out.push({ symbol: h.symbol, company: h.name, kind: "price", value: pct, threshold: r.priceMovePct, date: p.date, text: `${pct > 0 ? "Up" : "Down"} ${Math.abs(pct).toFixed(2)}% ${p.kind === "intraday" ? "(intraday quote)" : "on the day"}`, provenance: h.provenance });
    if (h.volumeMultiple != null && h.volumeMultiple >= r.volumeMultiple)
      out.push({ symbol: h.symbol, company: h.name, kind: "volume", value: h.volumeMultiple, threshold: r.volumeMultiple, date: p.date, text: `Volume ${h.volumeMultiple.toFixed(1)}× its ${r.volumeLookback}-day average`, provenance: h.provenance });
  }
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

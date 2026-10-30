"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Hit { symbol: string; name: string; local: boolean }

export function TickerSearch({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced lookup driven by the input event (not an effect).
  const onType = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`); const j = await r.json(); setHits(j.results ?? []); setActive(0); } catch { setHits([]); }
    }, 160);
  };

  const go = (sym: string) => {
    const s = sym.trim().toUpperCase().replace(/\.NS$/, "");
    if (!/^[A-Z0-9&\-]{1,20}$/.test(s)) return;
    setPending(true);
    router.push(`/research/${encodeURIComponent(s)}`);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); go(hits[active]?.symbol ?? q); }} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-line2 bg-panel px-3 focus-within:border-accent/60">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" strokeLinecap="round" /></svg>
        <input autoFocus={autoFocus} value={q} onChange={(e) => onType(e.target.value)} aria-label="NSE ticker or company name"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } }}
          placeholder="NSE symbol or company — e.g. INFY, Bajaj Finance, TCS" className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-ink placeholder:text-faint focus:outline-none" />
        <button className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-bg disabled:opacity-40" disabled={!q.trim() || pending}>{pending ? "Opening…" : "Research"}</button>
      </div>
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line2 bg-panel2 shadow-xl" role="listbox">
          {hits.map((h, i) => (
            <li key={h.symbol} role="option" aria-selected={i === active}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(h.symbol)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] ${i === active ? "bg-line" : ""}`}>
                <span className="num w-24 shrink-0 text-ink">{h.symbol}</span>
                <span className="flex-1 truncate text-muted">{h.name}</span>
                <span className="text-[10.5px] text-faint">{h.local ? "on file" : "live"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

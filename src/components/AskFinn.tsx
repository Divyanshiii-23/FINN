"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Answer { question: string; symbol: string | null; intent: string; mode: "llm" | "extractive"; paragraphs: string[]; citations: { n: number; label: string; url: string; detail?: string }[]; note?: string }

export function AskFinn() {
  const path = usePathname();
  const ctx = path.match(/^\/(?:research|company)\/([^/?#]+)/)?.[1]?.toUpperCase() ?? null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<(Answer | { error: string; question: string })[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const suggestions = ctx
    ? [`What did ${ctx} management promise for this year?`, `Is ${ctx}'s cash generation supporting its profits?`, `What changed between the last two ${ctx} calls?`, `Why did ${ctx}'s margins move?`]
    : ["Which portfolio company deserves the most attention today?", "What did Infosys management promise for FY27?", "Is Reliance's cash generation supporting its profits?", "What changed between the last two Bajaj Finance calls?"];

  async function send(question: string) {
    if (question.trim().length < 3 || busy) return;
    setBusy(true); setQ("");
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, symbol: /attention|portfolio/i.test(question) ? null : ctx }) });
      const j = await res.json();
      setThread((t) => [...t, res.ok ? j : { error: j.error ?? "Something went wrong", question }]);
    } catch { setThread((t) => [...t, { error: "Network error — try again.", question }]); }
    setBusy(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Ask FINN"
        className="fixed bottom-[76px] right-3 z-40 flex items-center gap-2 rounded-full border border-line2 bg-panel2/95 px-3.5 py-2 text-[13px] text-ink shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur hover:border-accent/50 lg:bottom-6 lg:right-6">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Ask<span className="hidden sm:inline"> FINN</span>{ctx ? <span className="num hidden text-muted sm:inline">· {ctx}</span> : null}
        <kbd className="ml-1 hidden rounded border border-line2 px-1 font-mono text-[10px] text-faint lg:inline">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Ask FINN" onClick={(e) => e.stopPropagation()} className="rise flex max-h-[86dvh] w-full max-w-[640px] flex-col rounded-t-2xl border border-line2 bg-panel sm:rounded-2xl">
            <div className="flex items-center justify-between border-b hairline px-4 py-3">
              <div>
                <div className="text-[14px] font-medium">Ask FINN</div>
                <div className="text-[11.5px] text-faint">Answers only from primary disclosures and FINN&apos;s computed metrics — with citations.</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:text-ink" aria-label="Close">✕</button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {!thread.length && (
                <div className="space-y-2">
                  <div className="eyebrow">Try</div>
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="block w-full rounded-md border hairline bg-panel2 px-3 py-2 text-left text-[13px] text-muted hover:border-line2 hover:text-ink">{s}</button>
                  ))}
                </div>
              )}
              {thread.map((a, i) => (
                <div key={i} className="space-y-2">
                  <div className="text-[13px] text-muted">› {a.question}</div>
                  {"error" in a ? <div className="text-[13px] text-neg">{a.error}</div> : (
                    <div className="rounded-lg border hairline bg-panel2 p-3.5">
                      <div className="space-y-2 text-[13.5px] leading-relaxed text-ink/95">
                        {a.paragraphs.map((p, k) => <p key={k}>{renderCites(p)}</p>)}
                      </div>
                      {a.citations.length > 0 && (
                        <ol className="mt-3 space-y-1 border-t hairline pt-2.5">
                          {a.citations.map((c) => (
                            <li key={c.n} className="flex gap-2 text-[11.5px]">
                              <span className="num text-accent">[{c.n}]</span>
                              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-muted underline decoration-line2 underline-offset-2 hover:text-ink">{c.label}</a>
                              {c.detail && <span className="text-faint">· {c.detail}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="mt-2 text-[10.5px] text-faint">{a.mode === "llm" ? "Synthesised by the reasoning model from the cited evidence; citations validated." : a.note ?? "Extractive answer."}</div>
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="text-[13px] text-muted">Reading the evidence…</div>}
              <div ref={endRef} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t hairline p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder={ctx ? `Ask about ${ctx}…` : "Ask about the portfolio or any company…"}
                className="min-w-0 flex-1 rounded-md border border-line2 bg-bg px-3 py-2 text-[14px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none" />
              <button disabled={busy || q.trim().length < 3} className="rounded-md bg-ink px-3.5 text-[13px] font-medium text-bg disabled:opacity-40">Ask</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function renderCites(p: string) {
  return p.split(/(\[\d+\])/g).map((part, i) => (/^\[\d+\]$/.test(part) ? <sup key={i} className="num ml-0.5 text-[10px] text-accent">{part}</sup> : <span key={i}>{part}</span>));
}

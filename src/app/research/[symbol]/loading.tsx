export default function Loading() {
  return (
    <div className="mx-auto max-w-[920px] animate-pulse">
      <div className="h-3 w-20 rounded bg-line" />
      <div className="mt-4 h-8 w-72 rounded bg-line" />
      <div className="mt-6 grid gap-px overflow-hidden rounded-lg sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 bg-panel" />)}
      </div>
      <div className="mt-8 h-64 rounded-xl bg-panel" />
      <p className="mt-4 text-[12.5px] text-muted">Reading financials and earnings-call transcripts… live research on a new ticker can take ~20 seconds; results are cached.</p>
    </div>
  );
}

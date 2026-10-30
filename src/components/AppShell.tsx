"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AskFinn } from "./AskFinn";

const NAV = [
  { href: "/", label: "Brief", icon: BriefIcon },
  { href: "/portfolio", label: "Portfolio", icon: GridIcon },
  { href: "/research", label: "Research", icon: LensIcon },
  { href: "/alerts", label: "Alerts", icon: BellIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/portfolio" && path.startsWith("/company")));
  return (
    <div className="min-h-dvh lg:flex">
      {/* desktop rail */}
      <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r hairline lg:px-4 lg:py-6 sticky top-0 h-dvh">
        <Wordmark />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active(n.href) ? "bg-panel2 text-ink" : "text-muted hover:text-ink hover:bg-panel"}`}>
              <n.icon active={active(n.href)} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto text-[11px] leading-relaxed text-faint">
          Primary sources only on the research side. Every number links to where it came from.
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* mobile header */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b hairline bg-bg/90 px-4 py-3 backdrop-blur">
          <Wordmark />
        </header>
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">{children}</main>
      </div>

      <AskFinn />

      {/* mobile tab bar */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t hairline bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active(n.href) ? "text-ink" : "text-faint"}`} aria-current={active(n.href) ? "page" : undefined}>
            <n.icon active={active(n.href)} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-baseline gap-2" aria-label="FINN home">
      <span className="font-mono text-[15px] font-medium tracking-[0.32em] text-ink">FINN</span>
      <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-accent" />
    </Link>
  );
}

type I = { active?: boolean };
const stroke = (a?: boolean) => (a ? "var(--color-accent)" : "currentColor");
function BriefIcon({ active }: I) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.6"><path d="M4 5h16M4 10h10M4 15h16M4 20h7" strokeLinecap="round" /></svg>; }
function GridIcon({ active }: I) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.6"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><path d="M13 17h7M16.5 13.5v7" strokeLinecap="round" /></svg>; }
function LensIcon({ active }: I) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.6"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" strokeLinecap="round" /></svg>; }
function BellIcon({ active }: I) { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="1.6"><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" strokeLinejoin="round" /><path d="M10 20.5a2 2 0 004 0" /></svg>; }

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { PulseTrace } from "./PulseTrace";

export const shellNavLink =
  "rounded-lg px-2.5 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-ink";
export const shellTab =
  "rounded-full border border-line px-3 py-1.5 font-mono text-xs text-muted transition hover:text-ink";
export const shellTabActive = "rounded-full border border-accent bg-accent-soft px-3 py-1.5 font-mono text-xs text-accent";

export type ShellTab = "tracker" | "sheet" | "leads" | "networking" | "jobs" | "connect";

const TABS: { href: string; label: string; key: ShellTab }[] = [
  { href: "/app", label: "Tracker", key: "tracker" },
  { href: "/app/sheet", label: "Sheet", key: "sheet" },
  { href: "/app/leads", label: "Leads", key: "leads" },
  { href: "/app/networking", label: "Networking", key: "networking" },
  { href: "/jobs", label: "Find jobs", key: "jobs" },
  { href: "/app/connect", label: "Connect agent", key: "connect" },
];

/**
 * The redesign shell for signed-in surfaces: dark palette (scoped via .pf-shell
 * in globals.css), ECG trace under the header, and tab navigation across the
 * tracker's three signed-in areas. Public pages keep the existing TopBar.
 */
export function AppShell({
  right,
  active,
  children,
}: {
  right?: ReactNode;
  active?: ShellTab;
  children: ReactNode;
}) {
  return (
    <div className="pf-shell min-h-dvh">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3">
          <Logo href="/app" />
          <nav className="flex items-center gap-1 text-sm">{right}</nav>
        </div>
        <PulseTrace className="block h-[10px] w-full opacity-70" glow={false} />
      </header>
      {active && (
        <div className="gutter mx-auto flex w-full max-w-[1180px] gap-1.5 overflow-x-auto pt-4" role="navigation" aria-label="Tracker sections">
          {TABS.map((t) => (
            <Link key={t.key} href={t.href} className={t.key === active ? shellTabActive : shellTab} aria-current={t.key === active ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

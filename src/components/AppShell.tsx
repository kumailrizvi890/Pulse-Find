import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { PulseTrace } from "./PulseTrace";

export const shellNavLink =
  "rounded-lg px-2.5 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-accent";
export const shellTab =
  "border-b-2 border-transparent px-2.5 py-1.5 font-mono text-xs text-muted transition hover:text-accent";
export const shellTabActive = "pf-nav-glow border-b-2 border-accent px-2.5 py-1.5 font-mono text-xs text-accent";

export type ShellTab = "tracker" | "sheet" | "leads" | "networking" | "jobs" | "connect";

/**
 * Signed-in tab order (Nov 19 2026): Find jobs sits ahead of Leads —
 * Kumail asked for the swap from his phone. It overrides the Nov 18
 * order (Leads before Find jobs). The tour step order is separate
 * (Leads step 3, Find jobs step 4) and is NOT changed here.
 */
const TABS: { href: string; label: string; key: ShellTab }[] = [
  { href: "/app", label: "Tracker", key: "tracker" },
  { href: "/app/sheet", label: "Sheet", key: "sheet" },
  { href: "/jobs", label: "Find jobs", key: "jobs" },
  { href: "/app/networking", label: "Networking", key: "networking" },
  { href: "/app/leads", label: "Leads", key: "leads" },
  { href: "/app/connect", label: "Connect agent", key: "connect" },
];

/**
 * The shell for signed-in surfaces: the measured dark palette, the red ECG
 * trace across the very top of the header, and tab navigation across the
 * tracker's signed-in areas. Public pages keep the existing TopBar.
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
      {/*
        * Sticky shell bars are SOLID, never translucent (Nov 19 PWA
        * fix). The old 85%-opaque blur let tracker rows show through
        * the header and tab bar while scrolling, so the greeting read
        * sliced in half behind the tabs. The header also sits at top-0
        * with the safe-area inset as padding instead of as an offset:
        * offsetting it down left a see-through strip above the pulse
        * line where scrolled content showed through on the installed
        * app. Desktop is unchanged: the inset is 0 there, so top-0
        * plus zero padding is the same position as before.
        */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
        <PulseTrace className="block h-[14px] w-full" glow />
        <div className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3">
          <Logo href="/app" />
          <nav className="flex items-center gap-1 text-sm">{right}</nav>
        </div>
      </header>
      {active && (
        <div className="sticky top-[calc(env(safe-area-inset-top,0px)+71px)] z-20 border-b border-line bg-bg">
          <div className="gutter mx-auto flex w-full max-w-[1180px] gap-1.5 overflow-x-auto pt-3" role="navigation" aria-label="Tracker sections">
            {TABS.map((t) => (
              <Link key={t.key} href={t.href} className={t.key === active ? shellTabActive : shellTab} aria-current={t.key === active ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

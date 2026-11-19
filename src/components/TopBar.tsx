import Link from "next/link";
import type { ReactNode } from "react";
import { IconExternalLink } from "./icons";
import { Logo } from "./Logo";
import { PulseTrace } from "./PulseTrace";

export function TopBar({ right, home = "/" }: { right?: ReactNode; home?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg pt-[env(safe-area-inset-top,0px)]">
      {/*
       * Same solid-header fix as the signed-in shell (Nov 19 PWA fix):
       * solid background, top-0 with the safe-area inset as padding,
       * so scrolled content never shows through the top or the bar on
       * the installed app. Desktop is unchanged: the inset is 0 there.
       */}
      <PulseTrace className="block h-[12px] w-full" glow />
      <div className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3">
        <Logo href={home} />
        <nav className="flex shrink-0 items-center gap-1 text-sm">{right}</nav>
      </div>
    </header>
  );
}

// At phone width the public nav (Jobs, Demo, Sign in, Connect) plus the
// logo measures about 396px against 398px of room, so a 1-2px squeeze
// wrapped "Sign in" and "Pulse Find" onto two lines. The links keep
// their desktop padding from sm up, but sit 2px tighter below it, and
// nothing in the bar wraps: the two-word items stay on one line.
export const navLink = "whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-accent sm:px-2.5";
// Compact red button for the top bar: same accent treatment as the page
// CTAs, sized to read as a button, not a plain link. Shared by the landing
// page and /privacy so the public nav matches everywhere.
export const navButton =
  "ml-1 inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink shadow-panel transition hover:brightness-110 sm:px-3.5";

export function GitHubLink() {
  return (
    <Link href="https://github.com/kumailrizvi890/Pulse-Find" className={`${navLink} inline-flex items-center gap-1`} target="_blank" rel="noopener">
      GitHub <IconExternalLink className="h-3 w-3 shrink-0" />
    </Link>
  );
}

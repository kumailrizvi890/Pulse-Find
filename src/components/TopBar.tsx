import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function TopBar({ right, home = "/" }: { right?: ReactNode; home?: string }) {
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between gap-3">
        <Logo href={home} />
        <nav className="flex items-center gap-1 text-sm">{right}</nav>
      </div>
    </header>
  );
}

export const navLink = "rounded-lg px-2.5 py-1.5 font-medium text-muted transition hover:bg-surface hover:text-ink";

export function GitHubLink() {
  return (
    <Link href="https://github.com/kumailrizvi890/Pulse-Find" className={navLink} target="_blank" rel="noopener">
      GitHub
    </Link>
  );
}

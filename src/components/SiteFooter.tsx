import Link from "next/link";
import { PulseMark } from "./Logo";

// The public-site footer, shared by the landing page and /privacy so the
// brand line and the five links stay identical on both pages.
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="gutter mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 py-8 text-sm text-faint">
        <p className="flex items-center gap-2">
          <PulseMark className="h-4 w-4" />
          <span className="font-display font-semibold text-muted">Pulse Find</span>
          <span aria-hidden="true">·</span>
          Built by{" "}
          <Link href="https://portfolio-kumailr.vercel.app" className="font-medium text-muted hover:text-accent" target="_blank" rel="noopener">
            Kumail Rizvi
          </Link>
        </p>
        <nav className="flex gap-4">
          <Link href="/jobs" className="hover:text-accent">Jobs</Link>
          <Link href="/app/connect" className="hover:text-accent">Agents</Link>
          <Link href="/demo" className="hover:text-accent">Demo</Link>
          <Link href="https://github.com/kumailrizvi890/Pulse-Find" className="hover:text-accent" target="_blank" rel="noopener">GitHub</Link>
          <Link href="/privacy" className="hover:text-accent">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

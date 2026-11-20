import Link from "next/link";
import { IconExternalLink } from "./icons";
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
          <Link href="https://portfolio-kumailr.vercel.app" className="inline-flex items-center gap-1 font-medium text-muted hover:text-accent" target="_blank" rel="noopener">
            Kumail Rizvi <IconExternalLink className="h-3 w-3 shrink-0" />
          </Link>
        </p>
        <nav className="flex gap-4">
          <Link href="/jobs" className="hover:text-accent">Jobs</Link>
          {/* The footer is public nav (landing, /privacy, not-found), so
          Agents points at the public Connect page: /app/connect would
          bounce a signed-out visitor to /login. */}
          <Link href="/demo/connect" className="hover:text-accent">Agents</Link>
          <Link href="/demo" className="hover:text-accent">Demo</Link>
          <Link href="https://github.com/kumailrizvi890/Pulse-Find" className="inline-flex items-center gap-1 hover:text-accent" target="_blank" rel="noopener">GitHub <IconExternalLink className="h-3 w-3 shrink-0" /></Link>
          <Link href="/privacy" className="hover:text-accent">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

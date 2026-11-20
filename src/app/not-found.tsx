import type { Metadata } from "next";
import Link from "next/link";
import { GitHubLink, TopBar, navButton, navLink } from "@/components/TopBar";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = { title: "Page not found" };

// A mistyped or stale link used to land on a bare 404 with no nav and no
// way back. The not-found page reuses the public TopBar and SiteFooter
// from the landing page, says plainly the page does not exist, and links
// home.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        right={
          <>
            <Link href="/jobs" className={navLink}>Jobs</Link>
            <Link href="/demo" className={navLink}>Demo</Link>
            <span className="hidden sm:inline">
              <GitHubLink />
            </span>
            <Link href="/login" className={navLink}>Sign in</Link>
            <Link href="/demo/connect" className={navButton}>Connect</Link>
          </>
        }
      />
      <main className="gutter mx-auto w-full max-w-[680px] flex-1 pb-20 pt-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          The link may be mistyped, or the page may have moved.
        </p>
        {/* navButton, not the dashboard btn: ui.tsx is a client module,
        so its plain btn object is undefined in this server component. */}
        <Link href="/" className={`${navButton} mt-6`}>
          Back to Pulse Find
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { GitHubLink, TopBar, navButton, navLink } from "@/components/TopBar";
import { SiteFooter } from "@/components/SiteFooter";
import { InstallSection } from "@/components/landing/InstallSection";
import { AboutLanding } from "@/components/landing/AboutLanding";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// The front door (Nov 19 2026): the old landing is replaced by the
// About page, with the Get the app section above it — TopBar →
// InstallSection (#getApp) → AboutLanding → SiteFooter. The tour
// window overlays this page on a signed-out first visit (see the
// tour window, mounted in the root layout); the page underneath is
// the About page, no lock veil, no navigation when the tour closes.
//
// Signed-in visitors never see this page: a session redirects
// straight to /app. Server-side, via the Supabase server client —
// the tour's own signed-in check stays as the backstop for anyone
// who lands here with a session anyway. When Supabase is not
// configured there is no session to check, so the page renders
// without the redirect (same as the tour's safe mode).
// force-dynamic: the redirect must run on every request, not once at
// build time — the env guard alone would let the page prerender
// static and skip the session check in production.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (env.supabaseUrl && env.supabaseKey) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/app");
  }
  return (
    <>
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
      <main>
        <InstallSection />
        <AboutLanding />
      </main>
      <SiteFooter />
    </>
  );
}

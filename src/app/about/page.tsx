import type { Metadata } from "next";
import Link from "next/link";
import { GitHubLink, TopBar, navButton, navLink } from "@/components/TopBar";
import { SiteFooter } from "@/components/SiteFooter";
import { InstallSection } from "@/components/landing/InstallSection";
import { AboutLanding } from "@/components/landing/AboutLanding";

export const metadata: Metadata = {
  title: "About",
  description:
    "Pulse Find is one dashboard for the whole internship search: fresh roles matched to you every morning, every application tracked by stage, and the right people lined up to talk to.",
};

// About (Nov 24 2026): the landing's About content as its own route.
// /about used to 404; it now renders the same InstallSection +
// AboutLanding as the landing's lower half, with the same TopBar and
// SiteFooter, so every link to it lands somewhere real.
export default function About() {
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
      <main>
        <InstallSection />
        <AboutLanding />
      </main>
      <SiteFooter />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { TopBar, navLink } from "@/components/TopBar";
import { AppShell, shellNavLink } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { JobsBoard } from "./JobsBoard";

export const metadata: Metadata = {
  title: "Find internships and new-grad roles",
  description: "Live internship and new-grad openings pulled straight from company career pages, refreshed every 6 hours.",
};
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  let user: { id: string; email?: string } | null = null;
  if (isConfigured()) {
    const supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user ?? null;
  }
  // Signed-in users get the tracker shell with its tab bar, so the navbar
  // stays put when they open Find jobs; signed-out visitors keep the
  // public TopBar with its Sign in link.
  if (user) {
    return (
      <AppShell
        active="jobs"
        right={
          <>
            <span className="hidden max-w-[220px] truncate px-2 text-xs text-faint sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className={shellNavLink}>Sign out</button>
            </form>
          </>
        }
      >
        <JobsBoard userId={user.id} />
      </AppShell>
    );
  }
  return (
    <>
      <TopBar
        home="/"
        right={
          <>
            <Link href="/demo" className={navLink}>
              Demo
            </Link>
            <Link href="/login" className={navLink}>
              Sign in
            </Link>
          </>
        }
      />
      <JobsBoard userId={null} />
    </>
  );
}

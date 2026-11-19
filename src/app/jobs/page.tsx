import type { Metadata } from "next";
import { AppShell, shellNavLink } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { DemoNav } from "../demo/DemoNav";
import { JobsBoard } from "./JobsBoard";

export const metadata: Metadata = {
  title: "Find internships and new-grad roles",
  description: "Live internship and new-grad openings pulled straight from company career pages, refreshed every 6 hours.",
};
export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ tour?: string | string[] }> }) {
  const sp = await searchParams;
  let user: { id: string; email?: string } | null = null;
  if (isConfigured()) {
    const supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user ?? null;
  }
  // Signed-in users get the tracker shell with its tab bar, so the navbar
  // stays put when they open Find jobs; signed-out visitors get the demo
  // nav, so a demo visitor who follows Jobs out of the demo can still
  // reach every demo section (and Ask Pulse) instead of landing on a
  // bare page with only Demo and Sign in. The badge says Live openings:
  // the board lists real openings, not the demo's fictional sample data.
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
      <DemoNav badge="Live openings" tour={typeof sp.tour === "string" ? sp.tour : undefined} />
      <JobsBoard userId={null} />
    </>
  );
}

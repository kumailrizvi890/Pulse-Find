import type { Metadata } from "next";
import Link from "next/link";
import { TopBar, navLink } from "@/components/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import { JobsBoard } from "./JobsBoard";

export const metadata: Metadata = {
  title: "Find internships and new-grad roles",
  description: "Live internship and new-grad openings pulled straight from company career pages, refreshed every 6 hours.",
};
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  let userId: string | null = null;
  if (isConfigured()) {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  }
  const board = (
    <>
      <TopBar
        home={userId ? "/app" : "/"}
        right={userId ? <Link href="/app" className={navLink}>My tracker</Link> : <Link href="/login" className={navLink}>Sign in</Link>}
      />
      <JobsBoard userId={userId} />
    </>
  );
  // Signed-in users stay in the dark redesign shell so the board reads as the
  // same product as the tracker; signed-out visitors get the public palette.
  return userId ? <div className="pf-shell min-h-dvh">{board}</div> : board;
}

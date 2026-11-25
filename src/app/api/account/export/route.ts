import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Full export of the signed-in user's data as a JSON download.
 * Reads go through the user's own session (row-level security), never
 * the service role. Token rows carry metadata only: id, created_at and
 * last_used_at — never token hashes.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });

  const [applications, jobLeads, contacts, events, profile, tokens, savedJobs] = await Promise.all([
    supabase.from("applications").select("*").eq("user_id", user.id),
    supabase.from("job_leads").select("*").eq("user_id", user.id),
    supabase.from("networking_contacts").select("*").eq("user_id", user.id),
    supabase.from("events").select("*").eq("user_id", user.id),
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("api_tokens").select("id,created_at,last_used_at").eq("user_id", user.id),
    supabase.from("saved_jobs").select("*").eq("user_id", user.id),
  ]);
  const failed = [applications, jobLeads, contacts, events, profile, tokens, savedJobs].find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: `Couldn't gather your data: ${failed.error.message}` }, { status: 500 });
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email ?? null,
      applications: applications.data ?? [],
      job_leads: jobLeads.data ?? [],
      networking_contacts: contacts.data ?? [],
      events: events.data ?? [],
      profile: profile.data ?? null,
      api_tokens: tokens.data ?? [],
      saved_jobs: savedJobs.data ?? [],
    },
    null,
    2,
  );
  const filename = `pulse-find-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

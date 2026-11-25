import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Delete the signed-in user's account and all of their data. The body
 * must contain { confirm: "DELETE" }; anything else is rejected with
 * 400 and nothing is deleted. Rows are deleted first (service role,
 * every delete explicitly scoped to this user — profiles has no delete
 * policy for the authenticated role, so the user client cannot delete
 * it), then the auth user itself is deleted through the admin API,
 * which cascades anything left behind.
 */
const TABLES = ["events", "applications", "job_leads", "networking_contacts", "saved_jobs", "api_tokens", "profiles"] as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to delete your account." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: 'To delete your account, send { "confirm": "DELETE" }.' }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  for (const table of TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ error: `Couldn't delete your ${table}: ${error.message}` }, { status: 500 });
    }
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: `Your data was deleted but the account itself could not be removed: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

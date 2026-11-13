import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/env";

/*
 * Server-only Supabase client using the service role key. It bypasses row
 * level security, so callers must scope every read and write to the owner's
 * rows. Never import this from client code.
 */
export function createServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(getSupabasePublicEnv().url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

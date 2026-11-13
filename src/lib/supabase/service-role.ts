import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/*
 * Server-only Supabase client using the service role key. It bypasses row
 * level security, so callers must scope every read and write to the owner's
 * rows. Never import this from client code.
 */
export function createServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

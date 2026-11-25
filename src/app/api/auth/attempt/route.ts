import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { AUTH_ATTEMPT_LIMIT, AUTH_ATTEMPT_WINDOW_SECONDS } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Pre-check for sign-up / sign-in, called by the auth form before it
 * talks to Supabase Auth: POST { email } -> 200 { allowed: true } while
 * the caller is under the limit, 429 { allowed: false,
 * retryAfterSeconds } once they are over it. The limit is 10 attempts
 * per 10 minutes per hashed email + IP, counted atomically in Postgres
 * (see check_rate_limit() in supabase/migrations/
 * 20261125000000_weeks1_3_backend.sql). Only the hash ever reaches the
 * database, never the address itself. A counter error fails open: this
 * check must never lock everyone out of sign-in.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ allowed: false, error: "A valid email address is required." }, { status: 400 });
  }
  const emailHash = createHash("sha256").update(email).digest("hex");
  const key = `auth:attempt:${emailHash}:${clientIp(request)}`;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_window_seconds: AUTH_ATTEMPT_WINDOW_SECONDS,
      p_limit: AUTH_ATTEMPT_LIMIT,
    });
    if (error || !Array.isArray(data) || !data[0]) return NextResponse.json({ allowed: true });
    const row = data[0] as { allowed: boolean; retry_after_seconds: number };
    if (row.allowed) return NextResponse.json({ allowed: true });
    return NextResponse.json(
      { allowed: false, retryAfterSeconds: Math.max(1, row.retry_after_seconds) },
      { status: 429 },
    );
  } catch {
    return NextResponse.json({ allowed: true });
  }
}

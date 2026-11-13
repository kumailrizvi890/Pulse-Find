import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  TRACKER_BUCKET,
  TRACKER_PATH,
  recordSyncRun,
  syncApplications,
  type SyncRunRecord,
} from "@/lib/sync-sheet";
import { importXlsx } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * The cron job calls this route with the CRON_SECRET value held in
 * Supabase Vault, sent as the x-cron-secret header or a Bearer token. The
 * same secret authorises the GET status check and a manual run. Nothing
 * from the tracker is ever returned here, only counts.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

function ownerId(): string {
  const id = process.env.SYNC_OWNER_USER_ID;
  if (!id) throw new Error("SYNC_OWNER_USER_ID is not set");
  return id;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  const supabase = createServiceRoleClient();
  const owner = ownerId();
  const body = (await request.json().catch(() => ({}))) as { source?: string };
  const source = typeof body.source === "string" && body.source.length > 0 ? body.source : "cron";
  let counts = { created: 0, updated: 0, skipped: 0, total: 0 };
  let trackerRows = 0;
  try {
    const { data, error } = await supabase.storage.from(TRACKER_BUCKET).download(TRACKER_PATH);
    if (error || !data) {
      throw new Error(`Could not download the tracker: ${error?.message ?? "empty file"}`);
    }
    const parsed = await importXlsx(await data.arrayBuffer(), startedAt.slice(0, 10));
    trackerRows = parsed.rows.length + parsed.skipped.length;
    counts = await syncApplications(supabase, owner, parsed.rows);
    await recordSyncRun(supabase, {
      user_id: owner,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "ok",
      source,
      ...counts,
      error: null,
    });
    return NextResponse.json({ ok: true, trackerRows, ...counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    // Record the failure too, so a broken run stays visible in the log.
    const run: SyncRunRecord = {
      user_id: owner,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "error",
      source,
      ...counts,
      error: message.slice(0, 500),
    };
    try {
      await recordSyncRun(supabase, run);
    } catch {
      // Logging must not hide the original failure.
    }
    return NextResponse.json({ ok: false, error: message, trackerRows, ...counts }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("started_at,finished_at,status,source,created,updated,skipped,total,error")
    .eq("user_id", ownerId())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ runs: 0 }, { status: 404 });
  return NextResponse.json(data);
}

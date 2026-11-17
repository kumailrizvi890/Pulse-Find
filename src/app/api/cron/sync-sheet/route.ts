import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  DISMISSAL_KIND,
  DISMISSAL_WINDOW_DAYS,
  TRACKER_BUCKET,
  TRACKER_NETWORKING_PATH,
  TRACKER_PATH,
  recordSyncRun,
  syncApplications,
  syncContacts,
  type SyncRunRecord,
} from "@/lib/sync-sheet";
import type { TrackerEvent } from "@/lib/types";
import { importNetworkingXlsx, importXlsx } from "@/lib/xlsx";

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
  let dismissals = 0;
  let dismissalsSkipped = false;
  try {
    const { data, error } = await supabase.storage.from(TRACKER_BUCKET).download(TRACKER_PATH);
    if (error || !data) {
      throw new Error(`Could not download the tracker: ${error?.message ?? "empty file"}`);
    }
    const parsed = await importXlsx(await data.arrayBuffer(), startedAt.slice(0, 10));
    trackerRows = parsed.rows.length + parsed.skipped.length;
    /*
     * A dismissal in the app must stick everywhere. Read the recent
     * "Action done" events so the sync does not restore a dismissed
     * action. If the events cannot be read, the sync still runs with the
     * old behaviour for this one run (and says so); the external python
     * sync writes the dismissal back to the tracker, so the next run
     * converges. The events read failing must never block the sync.
     */
    let events: TrackerEvent[] = [];
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DISMISSAL_WINDOW_DAYS);
      const { data: eventRows, error: eventsError } = await supabase
        .from("events")
        .select("application_id,event_date,kind,details")
        .eq("user_id", owner)
        .eq("kind", DISMISSAL_KIND)
        .gte("event_date", cutoff.toISOString().slice(0, 10))
        .order("event_date", { ascending: false })
        .limit(500);
      if (eventsError) throw new Error(eventsError.message);
      events = (eventRows ?? []) as TrackerEvent[];
    } catch {
      dismissalsSkipped = true;
    }
    const { writebacks, ...syncCounts } = await syncApplications(supabase, owner, parsed.rows, events);
    counts = syncCounts;
    dismissals = writebacks.length;
    /*
     * Networking contacts come from the Networking Tracker workbook in
     * the same bucket. A failure here must never block the applications
     * sync above: it is recorded and reported, and the next run retries.
     */
    let contactCounts = { created: 0, updated: 0, skipped: 0, total: 0 };
    let contactsError: string | null = null;
    try {
      const { data: netData, error: netError } = await supabase.storage.from(TRACKER_BUCKET).download(TRACKER_NETWORKING_PATH);
      if (netError || !netData) {
        throw new Error(`Could not download the networking tracker: ${netError?.message ?? "empty file"}`);
      }
      const parsedNet = await importNetworkingXlsx(await netData.arrayBuffer());
      contactCounts = await syncContacts(supabase, owner, parsedNet.rows);
    } catch (e) {
      contactsError = e instanceof Error ? e.message.slice(0, 500) : "Contacts sync failed";
    }
    await recordSyncRun(supabase, {
      user_id: owner,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "ok",
      source,
      ...counts,
      error: null,
    });
    return NextResponse.json({ ok: true, trackerRows, ...counts, dismissals, dismissalsSkipped, contacts: contactCounts, contacts_error: contactsError });
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

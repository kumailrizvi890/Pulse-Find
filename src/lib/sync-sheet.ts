import type { SupabaseClient } from "@supabase/supabase-js";

import type { Application, ApplicationInput, TrackerEvent } from "./types";

/*
 * The tracker workbook as stored in Supabase storage. The in-app sync
 * reads this copy; it never rewrites the workbook file itself, because a
 * rebuild would strip the Summary formulas and conditional formatting.
 * Dismissals are written back to the tracker by the external python sync
 * (openpyxl, in place), which is the only writer that preserves them.
 */
export const TRACKER_BUCKET = "dashboard-files";
export const TRACKER_PATH = "Application_Tracker.xlsx";

export type SyncCounts = {
  created: number;
  updated: number;
  skipped: number;
  total: number;
};

/*
 * Dedupe key the old external sync used: company, role and applied date,
 * lowercased and trimmed, joined with ::
 */
export function dedupeKey(company: string, role: string, dateApplied: string | null): string {
  return [company, role, dateApplied ?? ""]
    .map((part) => part.trim().toLowerCase())
    .join("::");
}

const SYNC_FIELDS: (keyof ApplicationInput)[] = [
  "company",
  "role",
  "track",
  "status",
  "date_applied",
  "last_contact",
  "oa_received",
  "interviews_done",
  "latest_update",
  "link",
  "notes",
  "action_needed",
  "action_due",
];

/*
 * Two values match when they are equal after trimming, treating null and
 * an empty string as the same blank. The tracker and the app use both.
 */
function sameValue(left: unknown, right: unknown): boolean {
  const a = typeof left === "string" ? left.trim() : left ?? null;
  const b = typeof right === "string" ? right.trim() : right ?? null;
  if (a === null || a === "") return b === null || b === "";
  if (b === null || b === "") return false;
  return a === b;
}

/* A patch only carries the fields that changed, as plain column values. */
export type SyncPatch = Record<string, string | number | boolean | null>;

export type SyncPlan = {
  creates: ApplicationInput[];
  updates: { id: string; patch: SyncPatch }[];
  skipped: number;
  /* Tracker rows whose dismissed action still sits on the sheet: the
     caller writes these back (clears the action on the tracker row) so
     the dismissal sticks everywhere. */
  writebacks: DismissalWriteback[];
};

/*
 * A dismissal is a "Waiting on you" action the user cleared in the app.
 * markDone (and a drawer edit that removes the action) logs an
 * "Action done" event whose details carry the dismissed text. The tracker
 * stays the source of truth for everything else, but a dismissed action
 * must stick everywhere: the sync must neither restore it into the app
 * nor leave it sitting on the tracker row.
 */
export const DISMISSAL_KIND = "Action done";
export const DISMISSAL_WINDOW_DAYS = 14;

/* dedupeKey -> the action texts dismissed for that row, still in force. */
export type DismissalMap = Map<string, Set<string>>;

/* One tracker row that still carries a dismissed action, for write-back. */
export type DismissalWriteback = {
  key: string;
  company: string;
  role: string;
  date_applied: string | null;
  action_needed: string;
  action_due: string | null;
};

function blankAction(row: { action_needed: string; action_due: string | null }): boolean {
  return sameValue(row.action_needed, "") && sameValue(row.action_due, null);
}

/*
 * Build the dismissal map from recent "Action done" events. Only events
 * for rows that are STILL dismissed in the app count: if the user (or a
 * later step) put an action back on the row, the dismissal is over.
 * Events older than the window are ignored, so an action deliberately
 * re-added to the tracker long after a dismissal is not mistaken for the
 * old one. The dismissed text is the match key: a NEW tracker action
 * (different text) is not a dismissal and still syncs in normally.
 */
export function buildDismissalMap(
  existing: Application[],
  events: TrackerEvent[],
  now: Date = new Date(),
): DismissalMap {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - DISMISSAL_WINDOW_DAYS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const map: DismissalMap = new Map();
  for (const event of events) {
    if (event.kind !== DISMISSAL_KIND) continue;
    const text = (event.details ?? "").trim();
    if (!text) continue;
    if (event.event_date < cutoffDay) continue;
    const app = byId.get(event.application_id);
    if (!app || !blankAction(app)) continue;
    const key = dedupeKey(app.company, app.role, app.date_applied);
    const set = map.get(key) ?? new Set<string>();
    set.add(text);
    map.set(key, set);
  }
  return map;
}

/* True when the tracker row still carries an action the user dismissed. */
function isDismissed(key: string, trackerAction: string, dismissals?: DismissalMap): boolean {
  if (!dismissals) return false;
  const texts = dismissals.get(key);
  if (!texts) return false;
  const current = (trackerAction ?? "").trim();
  if (!current) return false;
  return texts.has(current);
}

/*
 * The tracker rows that still carry a dismissed action. The caller clears
 * action_needed/action_due on each of these rows in the workbook itself.
 * A row is listed only when the app row is still dismissed and the tracker
 * text still equals a dismissed text: a new or changed tracker action is
 * not listed, and neither is a row whose action was put back in the app.
 */
export function planDismissalWritebacks(
  existing: Application[],
  incoming: ApplicationInput[],
  dismissals?: DismissalMap,
): DismissalWriteback[] {
  if (!dismissals) return [];
  const byKey = new Map(
    existing.map((row) => [dedupeKey(row.company, row.role, row.date_applied), row]),
  );
  const out: DismissalWriteback[] = [];
  for (const row of incoming) {
    const key = dedupeKey(row.company, row.role, row.date_applied);
    const current = byKey.get(key);
    if (!current) continue;
    if (!blankAction(current)) continue;
    if (!isDismissed(key, row.action_needed, dismissals)) continue;
    if (sameValue(row.action_needed, "") && sameValue(row.action_due, null)) continue;
    out.push({
      key,
      company: row.company,
      role: row.role,
      date_applied: row.date_applied,
      action_needed: row.action_needed,
      action_due: row.action_due,
    });
  }
  return out;
}

/*
 * Compare tracker rows against the owner's existing rows. Every field is
 * compared, including track, so a drifted value is patched. Rows are never
 * deleted, and a second run over the same data plans no writes. The one
 * exception is a dismissed action: when the tracker row still carries an
 * action the user cleared in the app, action_needed and action_due are
 * left alone instead of being restored, and the row is listed in
 * writebacks so the caller can clear it on the tracker itself.
 */
export function buildSyncPlan(
  existing: Application[],
  incoming: ApplicationInput[],
  dismissals?: DismissalMap,
): SyncPlan {
  const byKey = new Map<string, Application>();
  for (const row of existing) {
    byKey.set(dedupeKey(row.company, row.role, row.date_applied), row);
  }
  const seen = new Set<string>();
  const creates: ApplicationInput[] = [];
  const updates: SyncPlan["updates"] = [];
  let skipped = 0;
  for (const row of incoming) {
    const key = dedupeKey(row.company, row.role, row.date_applied);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const current = byKey.get(key);
    if (!current) {
      creates.push(row);
      continue;
    }
    const patch: SyncPatch = {};
    for (const field of SYNC_FIELDS) {
      // A dismissal only holds while the app row is still dismissed. If an
      // action is back on the row, the tracker wins again as usual.
      if (
        (field === "action_needed" || field === "action_due") &&
        blankAction(current) &&
        isDismissed(key, row.action_needed, dismissals)
      ) {
        continue;
      }
      if (!sameValue(current[field], row[field])) patch[field] = row[field];
    }
    if (Object.keys(patch).length > 0) updates.push({ id: current.id, patch });
  }
  return { creates, updates, skipped, writebacks: planDismissalWritebacks(existing, incoming, dismissals) };
}

/* A row of the sync log. Written with the service role client so the route
   can record its own runs, and read back by the owner. */
export type SyncRunRecord = {
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: "ok" | "error";
  source: string;
  created: number;
  updated: number;
  skipped: number;
  total: number;
  error: string | null;
};

export async function recordSyncRun(supabase: SupabaseClient, run: SyncRunRecord): Promise<void> {
  const { error } = await supabase.from("sync_runs").insert(run);
  if (error) throw new Error(`Could not record the sync run: ${error.message}`);
}

/*
 * Apply a sync plan to the owner's rows only. The service role client
 * bypasses row level security, so every statement is filtered on user_id.
 * Pass the owner's recent events so a dismissal in the app is honoured:
 * dismissed actions are not restored, and the plan's writebacks name the
 * tracker rows the caller still has to clear in the workbook itself.
 */
export type SyncResult = SyncCounts & { writebacks: DismissalWriteback[] };

export async function syncApplications(
  supabase: SupabaseClient,
  ownerId: string,
  incoming: ApplicationInput[],
  events: TrackerEvent[] = [],
): Promise<SyncResult> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id,company,role,track,status,date_applied,last_contact,oa_received,interviews_done,latest_update,link,notes,action_needed,action_due",
    )
    .eq("user_id", ownerId);
  if (error) throw new Error(`Could not read the applications: ${error.message}`);
  const apps = (data ?? []) as Application[];
  const dismissals = buildDismissalMap(apps, events);
  const plan = buildSyncPlan(apps, incoming, dismissals);
  if (plan.creates.length > 0) {
    const { error: insertError } = await supabase
      .from("applications")
      .insert(plan.creates.map((row) => ({ ...row, user_id: ownerId })));
    if (insertError) throw new Error(`Could not create missing applications: ${insertError.message}`);
  }
  for (const update of plan.updates) {
    const { error: updateError } = await supabase
      .from("applications")
      .update(update.patch)
      .eq("id", update.id)
      .eq("user_id", ownerId);
    if (updateError) throw new Error(`Could not update application ${update.id}: ${updateError.message}`);
  }
  return {
    created: plan.creates.length,
    updated: plan.updates.length,
    skipped: plan.skipped,
    total: incoming.length,
    writebacks: plan.writebacks,
  };
}

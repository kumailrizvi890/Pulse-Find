import type { SupabaseClient } from "@supabase/supabase-js";

import type { Application, ApplicationInput } from "./types";

/*
 * The tracker workbook as stored in Supabase storage. The sync reads this
 * copy and never writes back to the tracker itself.
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
};

/*
 * Compare tracker rows against the owner's existing rows. Every field is
 * compared, including track, so a drifted value is patched. Rows are never
 * deleted, and a second run over the same data plans no writes.
 */
export function buildSyncPlan(existing: Application[], incoming: ApplicationInput[]): SyncPlan {
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
      if (!sameValue(current[field], row[field])) patch[field] = row[field];
    }
    if (Object.keys(patch).length > 0) updates.push({ id: current.id, patch });
  }
  return { creates, updates, skipped };
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
 */
export async function syncApplications(
  supabase: SupabaseClient,
  ownerId: string,
  incoming: ApplicationInput[],
): Promise<SyncCounts> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id,company,role,track,status,date_applied,last_contact,oa_received,interviews_done,latest_update,link,notes,action_needed,action_due",
    )
    .eq("user_id", ownerId);
  if (error) throw new Error(`Could not read the applications: ${error.message}`);
  const plan = buildSyncPlan((data ?? []) as Application[], incoming);
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
  };
}

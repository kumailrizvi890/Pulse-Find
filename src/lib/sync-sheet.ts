import type { SupabaseClient } from "@supabase/supabase-js";

import type { Application, ApplicationInput, Contact, ContactInput, TrackerEvent } from "./types";

/*
 * The tracker workbook as stored in Supabase storage. The in-app sync
 * reads this copy; it never rewrites the workbook file itself, because a
 * rebuild would strip the Summary formulas and conditional formatting.
 * Dismissals are written back to the tracker by the external python sync
 * (openpyxl, in place), which is the only writer that preserves them.
 */
export const TRACKER_BUCKET = "dashboard-files";
export const TRACKER_PATH = "Application_Tracker.xlsx";
/* The Networking Tracker workbook, uploaded to the same bucket every 2h by the dashboard sync. */
export const TRACKER_NETWORKING_PATH = "Networking_Tracker.xlsx";

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

/*
 * An app row with no tracker row of its own inside a key that does have
 * tracker rows: surplus. `collision` is true when the key also carries
 * more than one distinct tracker row (two real applications sharing a
 * key, e.g. IBM Rochester vs Tucson), false for a plain true duplicate
 * (one tracker row, two app rows, e.g. the Activision row the Nov 16
 * retry left behind). Surplus rows are reported, never deleted.
 */
export type DuplicateRow = {
  key: string;
  company: string;
  role: string;
  date_applied: string | null;
  appId: string;
  status: string;
  collision: boolean;
};

export type SyncPlan = {
  creates: ApplicationInput[];
  updates: { id: string; patch: SyncPatch }[];
  skipped: number;
  /* Tracker rows whose dismissed action still sits on the sheet: the
     caller writes these back (clears the action on the tracker row) so
     the dismissal sticks everywhere. */
  writebacks: DismissalWriteback[];
  /* App rows with no tracker row of their own inside a matched key. */
  duplicates: DuplicateRow[];
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
 * Score how well a tracker row pairs with an app row inside one key
 * group. The link is the strongest signal (it carries the posting or the
 * message URL, which is what tells Rochester from Tucson apart); an
 * identical latest_update is next; shared long tokens (a req number, a
 * city) can only break ties; status is a weak tiebreak because it changes
 * over time. Higher is better. The score is deliberately stable: nothing
 * in it moves when a status changes, so a pair does not flip on an OA.
 */
export function pairScore(tracker: ApplicationInput, app: Application): number {
  let score = 0;
  const tLink = (tracker.link ?? "").trim();
  const aLink = (app.link ?? "").trim();
  if (tLink && tLink === aLink) score += 4;
  const tUpdate = (tracker.latest_update ?? "").trim();
  const aUpdate = (app.latest_update ?? "").trim();
  if (tUpdate && tUpdate === aUpdate) {
    score += 2;
  } else if (tUpdate && aUpdate) {
    const tokens = (s: string): Set<string> =>
      new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 5));
    const aTokens = tokens(aUpdate);
    const shared = [...tokens(tUpdate)].filter((t) => aTokens.has(t)).length;
    score += Math.min(2, shared);
  }
  if (tracker.status && tracker.status === app.status) score += 1;
  return score;
}

/* True when two tracker rows carry the same content on every synced field. */
function sameRow(a: ApplicationInput, b: ApplicationInput): boolean {
  return SYNC_FIELDS.every((field) => sameValue(a[field], b[field]));
}

export type KeyGroupMatch = {
  pairs: { tracker: ApplicationInput; app: Application }[];
  unmatchedTracker: ApplicationInput[];
  unmatchedApp: Application[];
  skipped: number;
  /* Distinct tracker rows in the group (after identical rows are skipped). */
  distinctTracker: number;
};

/*
 * Pair the tracker rows of one key group with the app rows of the same
 * key, one to one, best score first. Identical tracker rows (same key,
 * same content) are the same row twice: only the first is paired and the
 * rest count as skipped. Distinct tracker rows sharing a key are real
 * applications (IBM Rochester vs Tucson) and each gets its own app row;
 * a tracker row with no app row left becomes a create, and an app row
 * with no tracker row left is surplus, reported by the caller.
 */
export function matchKeyGroup(
  trackerRows: ApplicationInput[],
  appRows: Application[],
): KeyGroupMatch {
  const distinct: ApplicationInput[] = [];
  let skipped = 0;
  for (const row of trackerRows) {
    if (distinct.some((d) => sameRow(d, row))) skipped += 1;
    else distinct.push(row);
  }
  const scored: { score: number; ti: number; ai: number }[] = [];
  distinct.forEach((tracker, ti) => {
    appRows.forEach((app, ai) => scored.push({ score: pairScore(tracker, app), ti, ai }));
  });
  scored.sort((x, y) => y.score - x.score || x.ti - y.ti || x.ai - y.ai);
  const usedT = new Set<number>();
  const usedA = new Set<number>();
  const pairs: KeyGroupMatch["pairs"] = [];
  for (const s of scored) {
    if (usedT.has(s.ti) || usedA.has(s.ai)) continue;
    usedT.add(s.ti);
    usedA.add(s.ai);
    pairs.push({ tracker: distinct[s.ti], app: appRows[s.ai] });
  }
  return {
    pairs,
    unmatchedTracker: distinct.filter((_, i) => !usedT.has(i)),
    unmatchedApp: appRows.filter((_, i) => !usedA.has(i)),
    skipped,
    distinctTracker: distinct.length,
  };
}

function groupByKey<T extends { company: string; role: string; date_applied: string | null }>(
  rows: T[],
): Map<string, T[]> {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = dedupeKey(row.company, row.role, row.date_applied);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  return byKey;
}

/* The field patch that brings one app row in line with its tracker row. */
function diffPatch(
  current: Application,
  row: ApplicationInput,
  key: string,
  dismissals?: DismissalMap,
): SyncPatch {
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
  return patch;
}

/*
 * The tracker rows that still carry a dismissed action. The caller clears
 * action_needed/action_due on each of these rows in the workbook itself.
 * A row is listed only when the app row is still dismissed and the tracker
 * text still equals a dismissed text: a new or changed tracker action is
 * not listed, and neither is a row whose action was put back in the app.
 * Pairing is per key group, so a dismissed action on one of two rows
 * sharing a key is matched to its own app row, not its neighbour's.
 */
export function planDismissalWritebacks(
  existing: Application[],
  incoming: ApplicationInput[],
  dismissals?: DismissalMap,
): DismissalWriteback[] {
  if (!dismissals) return [];
  const byKey = groupByKey(existing);
  const trackerByKey = groupByKey(incoming);
  const out: DismissalWriteback[] = [];
  for (const [key, trackerRows] of trackerByKey) {
    const appRows = byKey.get(key) ?? [];
    const { pairs } = matchKeyGroup(trackerRows, appRows);
    for (const { tracker: row, app: current } of pairs) {
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
 *
 * Two rows can share one key: distinct tracker rows are paired one to one
 * with app rows (link, then latest_update, then shared tokens), so
 * Rochester and Tucson stop overwriting each other; surplus app rows are
 * reported in `duplicates` (true duplicate when the key has one tracker
 * row, collision surplus when it has several) and never deleted.
 */
export function buildSyncPlan(
  existing: Application[],
  incoming: ApplicationInput[],
  dismissals?: DismissalMap,
): SyncPlan {
  const byKey = groupByKey(existing);
  const trackerByKey = groupByKey(incoming);
  const creates: ApplicationInput[] = [];
  const updates: SyncPlan["updates"] = [];
  const duplicates: DuplicateRow[] = [];
  let skipped = 0;
  for (const [key, trackerRows] of trackerByKey) {
    const appRows = byKey.get(key) ?? [];
    const { pairs, unmatchedTracker, unmatchedApp, skipped: s, distinctTracker } = matchKeyGroup(
      trackerRows,
      appRows,
    );
    skipped += s;
    for (const { tracker, app } of pairs) {
      const patch = diffPatch(app, tracker, key, dismissals);
      if (Object.keys(patch).length > 0) updates.push({ id: app.id, patch });
    }
    creates.push(...unmatchedTracker);
    for (const app of unmatchedApp) {
      duplicates.push({
        key,
        company: app.company,
        role: app.role,
        date_applied: app.date_applied,
        appId: app.id,
        status: app.status,
        collision: distinctTracker > 1,
      });
    }
  }
  return {
    creates,
    updates,
    skipped,
    writebacks: planDismissalWritebacks(existing, incoming, dismissals),
    duplicates,
  };
}

/* ---------- networking contacts ---------- */

/** Dedupe identity for a contact: same person at the same company (case-insensitive) is the same contact. */
export function contactKey(personName: string, company: string): string {
  return [personName, company].map((part) => part.trim().toLowerCase()).join("::");
}

const CONTACT_SYNC_FIELDS: (keyof ContactInput)[] = [
  "company",
  "status",
  "next_step",
  "next_step_on",
  "notes",
  "linkedin_url",
  "last_contacted",
];

export type ContactSyncPlan = {
  creates: ContactInput[];
  updates: { id: string; patch: SyncPatch }[];
  skipped: number;
};

/*
 * Compare tracker contacts against the owner's existing contacts. A
 * non-blank tracker value wins; a blank tracker value is "no data", not
 * "clear this field" — the tracker only has a Profile URL for 449 of 537
 * people and a Last Touch for 133, so a blank must never wipe a URL or
 * date the user entered by hand in the app. Rows are never deleted, and
 * a second run over the same data plans no writes.
 */
export function buildContactSyncPlan(existing: Contact[], incoming: ContactInput[]): ContactSyncPlan {
  const byKey = new Map<string, Contact>();
  for (const row of existing) {
    byKey.set(contactKey(row.person_name, row.company), row);
  }
  const seen = new Set<string>();
  const creates: ContactInput[] = [];
  const updates: ContactSyncPlan["updates"] = [];
  let skipped = 0;
  for (const row of incoming) {
    const key = contactKey(row.person_name, row.company);
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
    for (const field of CONTACT_SYNC_FIELDS) {
      const next = row[field];
      if (next === null || next === "") continue;
      if (!sameValue(current[field], next)) patch[field] = next;
    }
    if (Object.keys(patch).length > 0) updates.push({ id: current.id, patch });
  }
  return { creates, updates, skipped };
}

/*
 * Apply a contact sync plan to the owner's rows only. Mirrors
 * syncApplications: the service role client bypasses row level security,
 * so every statement is filtered on user_id.
 */
export async function syncContacts(
  supabase: SupabaseClient,
  ownerId: string,
  incoming: ContactInput[],
): Promise<SyncCounts> {
  const { data, error } = await supabase
    .from("networking_contacts")
    .select("id,person_name,company,status,next_step,next_step_on,notes,linkedin_url,last_contacted")
    .eq("user_id", ownerId);
  if (error) throw new Error(`Could not read the contacts: ${error.message}`);
  const contacts = (data ?? []) as Contact[];
  const plan = buildContactSyncPlan(contacts, incoming);
  if (plan.creates.length > 0) {
    const { error: insertError } = await supabase
      .from("networking_contacts")
      .insert(plan.creates.map((row) => ({ ...row, user_id: ownerId })));
    if (insertError) throw new Error(`Could not create missing contacts: ${insertError.message}`);
  }
  for (const update of plan.updates) {
    const { error: updateError } = await supabase
      .from("networking_contacts")
      .update(update.patch)
      .eq("id", update.id)
      .eq("user_id", ownerId);
    if (updateError) throw new Error(`Could not update contact ${update.id}: ${updateError.message}`);
  }
  return { created: plan.creates.length, updated: plan.updates.length, skipped: plan.skipped, total: incoming.length };
}

/* A row of the sync log. Written with the service role client so the route
   can record its own runs, and read back by the owner. */
export type SyncRunRecord = {
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: "ok" | "error" | "running";
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
 * A sync run is claimed up front and finished at the end. The route used
 * to record its run only when it finished, so a second invocation that
 * started while the first was still inserting could not see it and
 * planned the same creates: that is how a sync-trigger retry (its 55s
 * timeout fires while the route still has up to 60s) could insert a
 * duplicate. A second invocation that finds a fresh claim exits early
 * instead. A claim older than CLAIM_STALE_MINUTES is stale (a run cannot
 * last longer than the route's 60s maxDuration) and is ignored.
 */
export const CLAIM_STALE_MINUTES = 10;

export type SyncClaim = { id: string; alreadyRunning: boolean };

export async function claimSyncRun(
  supabase: SupabaseClient,
  ownerId: string,
  startedAt: string,
  source: string,
): Promise<SyncClaim> {
  const { data, error } = await supabase
    .from("sync_runs")
    .select("id,started_at,status")
    .eq("user_id", ownerId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!error && data && data.status === "running") {
    const started = new Date(data.started_at).getTime();
    if (!Number.isNaN(started) && Date.now() - started < CLAIM_STALE_MINUTES * 60_000) {
      return { id: data.id, alreadyRunning: true };
    }
  }
  const { data: inserted, error: insertError } = await supabase
    .from("sync_runs")
    .insert({
      user_id: ownerId,
      started_at: startedAt,
      finished_at: null,
      status: "running",
      source,
      created: 0,
      updated: 0,
      skipped: 0,
      total: 0,
      error: null,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    throw new Error(`Could not claim the sync run: ${insertError?.message ?? "no id returned"}`);
  }
  return { id: inserted.id, alreadyRunning: false };
}

export type SyncRunFinish = {
  finished_at: string;
  status: "ok" | "error";
  created: number;
  updated: number;
  skipped: number;
  total: number;
  error: string | null;
};

export async function finishSyncRun(
  supabase: SupabaseClient,
  claimId: string,
  finish: SyncRunFinish,
): Promise<void> {
  const { error } = await supabase.from("sync_runs").update(finish).eq("id", claimId);
  if (error) throw new Error(`Could not finish the sync run: ${error.message}`);
}

/*
 * Apply a sync plan to the owner's rows only. The service role client
 * bypasses row level security, so every statement is filtered on user_id.
 * Pass the owner's recent events so a dismissal in the app is honoured:
 * dismissed actions are not restored, and the plan's writebacks name the
 * tracker rows the caller still has to clear in the workbook itself.
 */
export type SyncResult = SyncCounts & {
  writebacks: DismissalWriteback[];
  duplicates: DuplicateRow[];
};

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
  let creates = plan.creates;
  let updates = plan.updates;
  if (creates.length > 0) {
    /*
     * Re-read the rows immediately before inserting: a second invocation
     * (a sync-trigger retry, or a manual run) may have created the same
     * rows since the plan was built. A create whose key now exists
     * becomes an update against the fresh row instead, so the retry can
     * never leave a duplicate behind. The run claim in the route is the
     * main guard; this is the backstop for a run that started unclaimed.
     */
    const { data: fresh, error: freshError } = await supabase
      .from("applications")
      .select(
        "id,company,role,track,status,date_applied,last_contact,oa_received,interviews_done,latest_update,link,notes,action_needed,action_due",
      )
      .eq("user_id", ownerId);
    if (freshError) {
      throw new Error(`Could not re-check applications before creating: ${freshError.message}`);
    }
    const freshByKey = groupByKey((fresh ?? []) as Application[]);
    const stillCreates: ApplicationInput[] = [];
    const extraUpdates = [...updates];
    for (const row of creates) {
      const key = dedupeKey(row.company, row.role, row.date_applied);
      const matches = freshByKey.get(key) ?? [];
      if (matches.length === 0) {
        stillCreates.push(row);
        continue;
      }
      const { pairs } = matchKeyGroup([row], matches);
      const target = pairs[0]?.app ?? matches[0];
      const patch = diffPatch(target, row, key, dismissals);
      if (Object.keys(patch).length > 0) extraUpdates.push({ id: target.id, patch });
    }
    creates = stillCreates;
    updates = extraUpdates;
  }
  if (creates.length > 0) {
    const { error: insertError } = await supabase
      .from("applications")
      .insert(creates.map((row) => ({ ...row, user_id: ownerId })));
    if (insertError) throw new Error(`Could not create missing applications: ${insertError.message}`);
  }
  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("applications")
      .update(update.patch)
      .eq("id", update.id)
      .eq("user_id", ownerId);
    if (updateError) throw new Error(`Could not update application ${update.id}: ${updateError.message}`);
  }
  return {
    created: creates.length,
    updated: updates.length,
    skipped: plan.skipped,
    total: incoming.length,
    writebacks: plan.writebacks,
    duplicates: plan.duplicates,
  };
}

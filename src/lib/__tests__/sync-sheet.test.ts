import { describe, expect, it } from "vitest";

import {
  CLAIM_STALE_MINUTES,
  buildContactSyncPlan,
  buildDismissalMap,
  buildSyncPlan,
  claimSyncRun,
  dedupeKey,
  finishSyncRun,
  matchKeyGroup,
  pairScore,
  planDismissalWritebacks,
} from "../sync-sheet";
import type { Application, ApplicationInput, Contact, ContactInput, TrackerEvent } from "../types";

function existing(overrides: Partial<Application> = {}): Application {
  return {
    id: "1",
    company: "DataAnnotation",
    role: "AI Trainer",
    track: "Other",
    status: "Applied",
    date_applied: "2026-11-01",
    last_contact: "2026-11-01",
    oa_received: false,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function incoming(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    company: "DataAnnotation",
    role: "AI Trainer",
    track: "Part-Time",
    status: "Applied",
    date_applied: "2026-11-01",
    last_contact: "2026-11-01",
    oa_received: false,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "",
    action_due: null,
    ...overrides,
  };
}

describe("dedupeKey", () => {
  it("lowercases and trims the parts", () => {
    expect(dedupeKey(" Samsung ", "Intern", "2026-11-07")).toBe("samsung::intern::2026-11-07");
  });

  it("treats a missing date as blank", () => {
    expect(dedupeKey("Acme", "Engineer", null)).toBe("acme::engineer::");
  });
});

describe("buildSyncPlan", () => {
  it("creates rows that are missing", () => {
    const plan = buildSyncPlan([], [incoming()]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it("updates a drifted track and nothing else", () => {
    const plan = buildSyncPlan([existing()], [incoming()]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.id).toBe("1");
    expect(plan.updates[0]?.patch).toEqual({ track: "Part-Time" });
  });

  it("plans no writes for identical rows", () => {
    const plan = buildSyncPlan([existing({ track: "Part-Time" })], [incoming()]);
    expect(plan).toEqual({ creates: [], updates: [], skipped: 0, writebacks: [], duplicates: [] });
  });

  it("treats null and an empty string as the same blank", () => {
    // The database can hand back null for a text column even though the
    // application type calls it a string.
    const plan = buildSyncPlan(
      [existing({ track: "Part-Time", notes: null as unknown as string })],
      [incoming({ notes: "" })],
    );
    expect(plan.updates).toHaveLength(0);
  });

  it("skips a repeated tracker row", () => {
    const plan = buildSyncPlan([], [incoming(), incoming()]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });

  it("treats a different applied date as a different row", () => {
    const plan = buildSyncPlan([existing()], [incoming({ date_applied: "2026-11-02" })]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });
});

describe("key collisions and true duplicates", () => {
  // IBM Software Developer Intern, 2026-11-15: Rochester (req 130103)
  // and Tucson (req 130092) are two real applications sharing one key.
  // The tracker tells them apart by link and by the req number in the
  // latest update; the app rows below are the broken state, where both
  // rows carry the Rochester text.
  const ROCHESTER_UPDATE =
    "Submitted via IBM Careers (job 130103, Rochester MN); assessment invite received";
  const TUCSON_UPDATE =
    "Submitted via IBM Careers (job 130092, Tucson AZ); assessment invite received";
  const GMAIL_URL = "https://mail.google.com/mail/?authuser=kumailrizvi890@gmail.com";
  const EMAIL = "kumailrizvi890@gmail.com";

  function ibmTracker(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
    return {
      company: "IBM",
      role: "Software Developer Intern",
      track: "Internship",
      status: "OA Received",
      date_applied: "2026-11-15",
      last_contact: "2026-11-15",
      oa_received: true,
      interviews_done: 0,
      latest_update: ROCHESTER_UPDATE,
      link: GMAIL_URL,
      notes: "",
      action_needed: "",
      action_due: null,
      ...overrides,
    };
  }

  function ibmApp(overrides: Partial<Application> = {}): Application {
    return {
      id: "app-rochester",
      company: "IBM",
      role: "Software Developer Intern",
      track: "Internship",
      status: "OA Received",
      date_applied: "2026-11-15",
      last_contact: "2026-11-15",
      oa_received: true,
      interviews_done: 0,
      latest_update: ROCHESTER_UPDATE,
      link: GMAIL_URL,
      notes: "",
      action_needed: "",
      action_due: null,
      created_at: "2026-11-15T00:00:00Z",
      updated_at: "2026-11-15T00:00:00Z",
      ...overrides,
    };
  }

  it("pairs two tracker rows sharing a key with two app rows by link", () => {
    const rochester = ibmTracker();
    const tucson = ibmTracker({ latest_update: TUCSON_UPDATE, link: EMAIL });
    const appRochester = ibmApp({ id: "app-rochester", link: GMAIL_URL });
    // The second app row still carries the Rochester text (the broken
    // state); its link is the email address, which is the Tucson row's.
    const appTucson = ibmApp({ id: "app-tucson", link: EMAIL });
    const plan = buildSyncPlan([appRochester, appTucson], [rochester, tucson]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.id).toBe("app-tucson");
    expect(plan.updates[0]?.patch).toEqual({ latest_update: TUCSON_UPDATE });
  });

  it("creates the second tracker row when only one app row exists", () => {
    const rochester = ibmTracker();
    const tucson = ibmTracker({ latest_update: TUCSON_UPDATE, link: EMAIL });
    const plan = buildSyncPlan([ibmApp()], [rochester, tucson]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]?.latest_update).toBe(TUCSON_UPDATE);
    expect(plan.updates).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("creates two distinct rows sharing a key and skips none", () => {
    const plan = buildSyncPlan(
      [],
      [ibmTracker(), ibmTracker({ latest_update: TUCSON_UPDATE, link: EMAIL })],
    );
    expect(plan.creates).toHaveLength(2);
    expect(plan.skipped).toBe(0);
  });

  it("reports a true duplicate app row instead of updating both", () => {
    // Activision, 2026-11-16: one tracker row, two app rows. The bare
    // row has no latest update and no link; the full row matches.
    const tracker: ApplicationInput = {
      company: "Activision",
      role: "Game Systems Engineering Intern",
      track: "Internship",
      status: "Applied",
      date_applied: "2026-11-16",
      last_contact: "2026-11-16",
      oa_received: false,
      interviews_done: 0,
      latest_update: "Applied Nov 16, 2026 — Workday confirmation email 10:41pm PT",
      link: EMAIL,
      notes: "",
      action_needed: "",
      action_due: null,
    };
    const full: Application = {
      id: "activision-full",
      company: "Activision",
      role: "Game Systems Engineering Intern",
      track: "Internship",
      status: "Applied",
      date_applied: "2026-11-16",
      last_contact: "2026-11-16",
      oa_received: false,
      interviews_done: 0,
      latest_update: "Applied Nov 16, 2026 — Workday confirmation email 10:41pm PT",
      link: EMAIL,
      notes: "",
      action_needed: "",
      action_due: null,
    };
    const bare: Application = { ...full, id: "activision-bare", latest_update: "", link: "" };
    const plan = buildSyncPlan([full, bare], [tracker]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]).toEqual({
      key: "activision::game systems engineering intern::2026-11-16",
      company: "Activision",
      role: "Game Systems Engineering Intern",
      date_applied: "2026-11-16",
      appId: "activision-bare",
      status: "Applied",
      collision: false,
    });
  });

  it("scores a link match above an identical latest update", () => {
    const rochester = ibmTracker();
    const tucson = ibmTracker({ latest_update: TUCSON_UPDATE, link: EMAIL });
    const appRochester = ibmApp({ id: "app-rochester", link: GMAIL_URL });
    const appTucson = ibmApp({ id: "app-tucson", link: EMAIL });
    // Both app rows carry the Rochester text, so the Tucson tracker row
    // matches the Tucson app row on link alone.
    expect(pairScore(tucson, appTucson)).toBeGreaterThan(pairScore(tucson, appRochester));
    expect(pairScore(rochester, appRochester)).toBeGreaterThan(pairScore(rochester, appTucson));
  });

  it("pairs one to one and leaves the rest unmatched", () => {
    const { pairs, unmatchedTracker, unmatchedApp, skipped } = matchKeyGroup(
      [ibmTracker(), ibmTracker({ latest_update: TUCSON_UPDATE, link: EMAIL })],
      [ibmApp({ id: "only" })],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.app.id).toBe("only");
    expect(unmatchedTracker).toHaveLength(1);
    expect(unmatchedTracker[0]?.latest_update).toBe(TUCSON_UPDATE);
    expect(unmatchedApp).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});

describe("dismissed actions stick everywhere", () => {
  // Fixed "now" so the 14-day dismissal window does not depend on the day
  // the suite runs.
  const NOW = new Date("2026-11-16T00:00:00Z");
  const KEY = "dataannotation::ai trainer::2026-11-01";
  const DISMISSED_TEXT = "Complete the HackerRank";

  function dismissedApp(overrides: Partial<Application> = {}): Application {
    // action_needed blank + action_due null = the row as markDone leaves it.
    return existing({ action_needed: "", action_due: null, ...overrides });
  }

  function trackerWithAction(overrides: Partial<ApplicationInput> = {}): ApplicationInput {
    // Same track as the app row so the action fields are the only drift.
    return incoming({ track: "Other", action_needed: DISMISSED_TEXT, action_due: "2026-11-20", ...overrides });
  }

  function dismissals(texts: string[] = [DISMISSED_TEXT]): Map<string, Set<string>> {
    return new Map([[KEY, new Set(texts)]]);
  }

  function actionDoneEvent(overrides: Partial<TrackerEvent> = {}): TrackerEvent {
    return {
      id: "e1",
      application_id: "1",
      event_date: "2026-11-15",
      kind: "Action done",
      details: DISMISSED_TEXT,
      ...overrides,
    };
  }

  it("does not restore a dismissed action into the app", () => {
    const plan = buildSyncPlan([dismissedApp()], [trackerWithAction()], dismissals());
    expect(plan.updates).toHaveLength(0);
    expect(plan.writebacks).toHaveLength(1);
  });

  it("still patches other drifted fields on a dismissed row", () => {
    const plan = buildSyncPlan(
      [dismissedApp()],
      [trackerWithAction({ status: "OA Received" })],
      dismissals(),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.patch).toEqual({ status: "OA Received" });
  });

  it("restores a NEW tracker action whose text differs from the dismissed one", () => {
    const plan = buildSyncPlan(
      [dismissedApp()],
      [trackerWithAction({ action_needed: "Complete the CodeSignal" })],
      dismissals(),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.patch).toEqual({
      action_needed: "Complete the CodeSignal",
      action_due: "2026-11-20",
    });
    expect(plan.writebacks).toHaveLength(0);
  });

  it("restores the action when the app row has an action again", () => {
    const plan = buildSyncPlan(
      [existing({ action_needed: "Something else", action_due: null })],
      [trackerWithAction()],
      dismissals(),
    );
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.patch).toEqual({
      action_needed: DISMISSED_TEXT,
      action_due: "2026-11-20",
    });
    expect(plan.writebacks).toHaveLength(0);
  });

  it("matches a dismissed action to its own row when a key is shared", () => {
    // Two tracker rows share a key; only the first carries the dismissed
    // action, and only its app row is still dismissed. The writeback
    // must list that row once, not its neighbour.
    const appA = dismissedApp({ id: "a1", link: "https://example.com/a" });
    const appB = existing({
      id: "a2",
      link: "https://example.com/b",
      action_needed: "Something else",
      action_due: null,
    });
    const rowA = trackerWithAction({ link: "https://example.com/a" });
    const rowB = incoming({
      track: "Other",
      link: "https://example.com/b",
      action_needed: "Something else",
      action_due: null,
    });
    const plan = buildSyncPlan([appA, appB], [rowA, rowB], dismissals());
    expect(plan.writebacks).toHaveLength(1);
    expect(plan.writebacks[0]?.action_needed).toBe(DISMISSED_TEXT);
  });

  describe("planDismissalWritebacks", () => {
    it("lists the tracker row that still carries the dismissed action", () => {
      expect(planDismissalWritebacks([dismissedApp()], [trackerWithAction()], dismissals())).toEqual([
        {
          key: KEY,
          company: "DataAnnotation",
          role: "AI Trainer",
          date_applied: "2026-11-01",
          action_needed: DISMISSED_TEXT,
          action_due: "2026-11-20",
        },
      ]);
    });

    it("lists nothing when the tracker action is new", () => {
      expect(
        planDismissalWritebacks(
          [dismissedApp()],
          [trackerWithAction({ action_needed: "Complete the CodeSignal" })],
          dismissals(),
        ),
      ).toEqual([]);
    });

    it("lists nothing when the tracker row is already clear", () => {
      expect(
        planDismissalWritebacks([dismissedApp()], [incoming({ track: "Other" })], dismissals()),
      ).toEqual([]);
    });

    it("lists nothing without a dismissal map", () => {
      expect(planDismissalWritebacks([dismissedApp()], [trackerWithAction()])).toEqual([]);
    });
  });

  describe("buildDismissalMap", () => {
    it("takes the dismissed text from a recent Action done event", () => {
      const map = buildDismissalMap([dismissedApp()], [actionDoneEvent()], NOW);
      expect(map.get(KEY)).toEqual(new Set([DISMISSED_TEXT]));
    });

    it("ignores events that are not Action done", () => {
      const map = buildDismissalMap(
        [dismissedApp()],
        [actionDoneEvent({ kind: "Applied", details: DISMISSED_TEXT })],
        NOW,
      );
      expect(map.size).toBe(0);
    });

    it("ignores events for rows that have an action again", () => {
      const map = buildDismissalMap(
        [existing({ action_needed: "Something else", action_due: null })],
        [actionDoneEvent()],
        NOW,
      );
      expect(map.size).toBe(0);
    });

    it("ignores events older than the window", () => {
      const map = buildDismissalMap(
        [dismissedApp()],
        [actionDoneEvent({ event_date: "2026-10-01" })],
        NOW,
      );
      expect(map.size).toBe(0);
    });

    it("ignores events with no dismissed text", () => {
      const map = buildDismissalMap(
        [dismissedApp()],
        [actionDoneEvent({ details: "  " })],
        NOW,
      );
      expect(map.size).toBe(0);
    });
  });
});

describe("sync run claims", () => {
  /*
   * A stub of the Supabase query builder, just enough for the claim
   * helpers: .from().select().eq().order().limit().maybeSingle() for the
   * latest run, .from().insert().select().single() for the claim, and
   * .from().update().eq() for finishing it.
   */
  type LatestRun = { id: string; started_at: string; status: string } | null;

  function stubSupabase(opts: { latestRun?: LatestRun; claimError?: string } = {}) {
    const calls: { insert: unknown[]; update: unknown[]; updateEq: unknown[] } = {
      insert: [],
      update: [],
      updateEq: [],
    };
    let mode: "select" | "insert" | "update" = "select";
    const table = {
      select: (..._args: unknown[]) => table,
      eq: (...args: unknown[]) => {
        if (mode === "update") {
          calls.updateEq.push(args);
          return Promise.resolve({ error: null });
        }
        return table;
      },
      order: (..._args: unknown[]) => table,
      limit: (..._args: unknown[]) => table,
      maybeSingle: async () => ({ data: opts.latestRun ?? null, error: null }),
      insert: (row: unknown) => {
        calls.insert.push(row);
        mode = "insert";
        return table;
      },
      single: async () => {
        if (opts.claimError) return { data: null, error: { message: opts.claimError } };
        return { data: { id: "claim-1" }, error: null };
      },
      update: (patch: unknown) => {
        calls.update.push(patch);
        mode = "update";
        return table;
      },
    };
    const client = {
      from: (_name: string) => table,
    };
    return { client, calls };
  }

  it("claims a run when none is in flight", async () => {
    const { client, calls } = stubSupabase({ latestRun: null });
    const claim = await claimSyncRun(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "owner-1",
      "2026-11-17T10:00:00Z",
      "cron",
    );
    expect(claim).toEqual({ id: "claim-1", alreadyRunning: false });
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0]).toMatchObject({ status: "running", user_id: "owner-1" });
  });

  it("exits early when a run started minutes ago", async () => {
    const started = new Date(Date.now() - 2 * 60_000).toISOString();
    const { client, calls } = stubSupabase({
      latestRun: { id: "old-claim", started_at: started, status: "running" },
    });
    const claim = await claimSyncRun(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "owner-1",
      "2026-11-17T10:00:00Z",
      "cron",
    );
    expect(claim).toEqual({ id: "old-claim", alreadyRunning: true });
    expect(calls.insert).toHaveLength(0);
  });

  it("ignores a stale running claim and claims a new run", async () => {
    const started = new Date(Date.now() - 30 * 60_000).toISOString();
    const { client, calls } = stubSupabase({
      latestRun: { id: "stale-claim", started_at: started, status: "running" },
    });
    const claim = await claimSyncRun(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "owner-1",
      "2026-11-17T10:00:00Z",
      "cron",
    );
    expect(claim.alreadyRunning).toBe(false);
    expect(calls.insert).toHaveLength(1);
  });

  it("does not treat a finished run as in flight", async () => {
    const started = new Date(Date.now() - 2 * 60_000).toISOString();
    const { client, calls } = stubSupabase({
      latestRun: { id: "done", started_at: started, status: "ok" },
    });
    const claim = await claimSyncRun(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "owner-1",
      "2026-11-17T10:00:00Z",
      "cron",
    );
    expect(claim.alreadyRunning).toBe(false);
    expect(calls.insert).toHaveLength(1);
  });

  it("finishes a claimed run by updating its row", async () => {
    const { client, calls } = stubSupabase();
    await finishSyncRun(
      client as unknown as import("@supabase/supabase-js").SupabaseClient,
      "claim-1",
      {
        finished_at: "2026-11-17T10:01:00Z",
        status: "ok",
        created: 2,
        updated: 1,
        skipped: 0,
        total: 3,
        error: null,
      },
    );
    expect(calls.update).toHaveLength(1);
    expect(calls.update[0]).toMatchObject({ status: "ok", created: 2, total: 3 });
    expect(calls.updateEq).toHaveLength(1);
    expect(calls.updateEq[0]).toEqual(["id", "claim-1"]);
  });

  it("exposes the stale-claim window", () => {
    expect(CLAIM_STALE_MINUTES).toBe(10);
  });
});

describe("contact sync survives alongside dedupe pairing", () => {
  /*
   * Merge regression: the dedupe rewrite and the Networking Tracker
   * contact sync live in the same module. A blind paste of either side
   * would wipe the other, so this pins both working together — a key
   * collision pairs by link while a contact still gets its LinkedIn URL
   * and last-contacted date filled.
   */
  function existingContact(overrides: Partial<Contact> = {}): Contact {
    return {
      id: "c1",
      person_name: "Subburaj Gurusamy",
      company: "Amazon",
      status: "Connected",
      next_step: "",
      next_step_on: null,
      notes: "",
      linkedin_url: "",
      last_contacted: null,
      ...overrides,
    };
  }

  function incomingContact(overrides: Partial<ContactInput> = {}): ContactInput {
    return {
      person_name: "Subburaj Gurusamy",
      company: "Amazon",
      status: "Connected",
      next_step: "",
      next_step_on: null,
      notes: "",
      linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
      last_contacted: "2026-10-26",
      ...overrides,
    };
  }

  it("pairs a key collision by link and still fills the contact fields", () => {
    const plan = buildSyncPlan(
      [
        existing({ id: "a1", company: "IBM", role: "Software Developer Intern", link: "https://example.com/rochester", latest_update: "Rochester" }),
        existing({ id: "a2", company: "IBM", role: "Software Developer Intern", link: "https://example.com/rochester", latest_update: "Rochester" }),
      ],
      [
        incoming({ company: "IBM", role: "Software Developer Intern", track: "Other", link: "https://example.com/rochester", latest_update: "Rochester" }),
        incoming({ company: "IBM", role: "Software Developer Intern", track: "Other", link: "https://example.com/tucson", latest_update: "Tucson" }),
      ],
    );
    // Rochester tracker matches a1 exactly (no patch); Tucson pairs with
    // a2 and patches it, instead of overwriting a1 a second time.
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe("a2");
    expect(plan.updates[0].patch).toEqual({ link: "https://example.com/tucson", latest_update: "Tucson" });
    expect(plan.duplicates).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);

    const contacts = buildContactSyncPlan([], [incomingContact()]);
    expect(contacts.creates).toHaveLength(1);
    expect(contacts.creates[0].linkedin_url).toBe("https://www.linkedin.com/in/subburaj-gurusamy-a673a922");
    expect(contacts.creates[0].last_contacted).toBe("2026-10-26");
  });

  it("never wipes a hand-entered LinkedIn URL with a blank tracker value", () => {
    const plan = buildContactSyncPlan(
      [existingContact({ linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922", last_contacted: "2026-10-26" })],
      [incomingContact({ linkedin_url: "", last_contacted: null })],
    );
    expect(plan.updates).toHaveLength(0);
  });
});

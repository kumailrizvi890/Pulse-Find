import { describe, expect, it } from "vitest";

import { buildDismissalMap, buildSyncPlan, dedupeKey, planDismissalWritebacks } from "../sync-sheet";
import type { Application, ApplicationInput, TrackerEvent } from "../types";

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
    expect(plan).toEqual({ creates: [], updates: [], skipped: 0, writebacks: [] });
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

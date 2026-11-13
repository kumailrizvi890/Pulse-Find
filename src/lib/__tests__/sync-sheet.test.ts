import { describe, expect, it } from "vitest";

import { buildSyncPlan, dedupeKey } from "../sync-sheet";
import type { Application, ApplicationInput } from "../types";

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
    latest_update: null,
    link: null,
    notes: null,
    action_needed: false,
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
    latest_update: null,
    link: null,
    notes: null,
    action_needed: false,
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
    expect(plan).toEqual({ creates: [], updates: [], skipped: 0 });
  });

  it("treats null and an empty string as the same blank", () => {
    const plan = buildSyncPlan([existing({ track: "Part-Time", notes: null })], [incoming({ notes: "" })]);
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

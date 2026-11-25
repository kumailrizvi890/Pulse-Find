import { describe, expect, it } from "vitest";

import { buildReminderDigest, dueOn, groupByUser, tomorrowISO, type DueApplication } from "../reminders";

const apps: DueApplication[] = [
  { company: "Stripe", role: "Software Engineer Intern", action_needed: "Finish the HackerRank", action_due: "2026-11-26" },
  { company: "Airbnb", role: "", action_needed: "", action_due: "2026-11-26" },
  { company: "Figma", role: "Product Engineer Intern", action_needed: "Reply to the recruiter", action_due: "2026-11-27" },
  { company: "Notion", role: "SWE Intern", action_needed: "Submit the take-home", action_due: null },
];

describe("reminder date math", () => {
  it("finds tomorrow across a month boundary", () => {
    expect(tomorrowISO("2026-11-30")).toBe("2026-12-01");
    expect(tomorrowISO("2026-12-31")).toBe("2027-01-01");
    expect(tomorrowISO("2026-11-25")).toBe("2026-11-26");
  });

  it("picks only the applications due on the given date", () => {
    expect(dueOn(apps, "2026-11-26").map((a) => a.company)).toEqual(["Stripe", "Airbnb"]);
    expect(dueOn(apps, "2026-11-27").map((a) => a.company)).toEqual(["Figma"]);
    expect(dueOn(apps, "2026-11-28")).toEqual([]);
  });
});

describe("groupByUser", () => {
  it("groups rows per user and keeps each user's rows together", () => {
    const rows = [
      { user_id: "u1", company: "Stripe" },
      { user_id: "u2", company: "Airbnb" },
      { user_id: "u1", company: "Figma" },
    ];
    const groups = groupByUser(rows);
    expect([...groups.keys()].sort()).toEqual(["u1", "u2"]);
    expect(groups.get("u1")!.map((r) => r.company)).toEqual(["Stripe", "Figma"]);
    expect(groups.get("u2")!.map((r) => r.company)).toEqual(["Airbnb"]);
  });
});

describe("buildReminderDigest", () => {
  it("lists every deadline with company, role and what is needed", () => {
    const { subject, text } = buildReminderDigest(dueOn(apps, "2026-11-26"), "2026-11-26");
    expect(subject).toBe("2 deadlines due tomorrow — Pulse Find");
    expect(text).toContain("Stripe — Software Engineer Intern: Finish the HackerRank");
    expect(text).toContain("Airbnb: Follow up");
    expect(text).toContain("November 26");
    expect(text).not.toContain("Figma");
    expect(text).not.toContain("Notion");
  });

  it("uses the singular subject for one deadline", () => {
    const { subject } = buildReminderDigest(dueOn(apps, "2026-11-27"), "2026-11-27");
    expect(subject).toBe("1 deadline due tomorrow — Pulse Find");
  });
});

import { describe, expect, it } from "vitest";
import {
  actionQueue, addDays, applyFilter, daysBetween, followUp, funnel, isTechRole, sortForTable, summarize, weekStart, weekly,
} from "../metrics";
import { emptyApplication, type Application } from "../types";

const TODAY = "2026-11-05"; // a Thursday

function app(over: Partial<Application> = {}): Application {
  return { ...emptyApplication(TODAY), id: Math.random().toString(36).slice(2), company: "Acme", ...over };
}

describe("dates", () => {
  it("counts days across month boundaries", () => {
    expect(daysBetween("2026-10-28", TODAY)).toBe(8);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
  it("finds the Monday of the week", () => {
    expect(weekStart(TODAY)).toBe("2026-11-02");
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before it
  });
});

describe("isTechRole", () => {
  it.each([
    ["Software Engineer Intern", true],
    ["SDE Intern - Summer 2027", true],
    ["Intern - SMAI TD AI Engineering Team", true],
    ["AI Research Intern", true],
    ["Fullstack / AI Engineer (New Grads)", true],
    ["Street Crew", false],
    ["Teller (Part-Time)", false],
    ["Brand Ambassador", false],
    ["Maintenance assistant", false], // contains "ai" inside a word, should not match
  ])("%s → %s", (role, expected) => {
    expect(isTechRole(role)).toBe(expected);
  });
});

describe("followUp", () => {
  it("flags ghosted at the threshold and follow-up-soon at half", () => {
    expect(followUp(app({ last_contact: addDays(TODAY, -21) }), TODAY, 21)).toBe("ghosted");
    expect(followUp(app({ last_contact: addDays(TODAY, -11) }), TODAY, 21)).toBe("soon");
    expect(followUp(app({ last_contact: addDays(TODAY, -3) }), TODAY, 21)).toBe("waiting");
  });
  it("never flags closed applications", () => {
    expect(followUp(app({ status: "Rejected", last_contact: "2026-01-01" }), TODAY, 21)).toBeNull();
    expect(followUp(app({ status: "Offer", last_contact: "2026-01-01" }), TODAY, 21)).toBeNull();
  });
});

describe("summaries", () => {
  const apps = [
    app({ role: "Software Engineer Intern", status: "Interviewing", interviews_done: 2, date_applied: "2026-11-03" }),
    app({ role: "Barista", status: "Offer", date_applied: "2026-10-01" }),
    app({ role: "Data Analyst", status: "OA Received", oa_received: true, action_needed: "Finish OA", action_due: "2026-11-04" }),
    app({ role: "Teller", status: "Applied", last_contact: "2026-09-01", date_applied: "2026-09-01" }),
  ];

  it("summarizes the pipeline", () => {
    const s = summarize(apps, TODAY, 21);
    expect(s.total).toBe(4);
    expect(s.tech).toBe(2);
    expect(s.interviews).toBe(2);
    expect(s.offers).toBe(1);
    expect(s.ghosted).toBe(1);
    expect(s.actions).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.responseRate).toBeCloseTo(0.75);
    expect(s.thisWeek).toBe(2); // Nov 3, plus the Data Analyst row defaulting to today
  });

  it("counts each application at every stage it reached", () => {
    expect(funnel(apps).map((f) => f.value)).toEqual([4, 3, 2, 1]);
  });

  it("buckets the last 12 weeks, oldest first", () => {
    const w = weekly(apps, TODAY);
    expect(w).toHaveLength(12);
    expect(w[11].start).toBe("2026-11-02");
    expect(w[11].tech + w[11].other).toBe(2);
    expect(w[6]).toMatchObject({ start: "2026-09-28", other: 1, tech: 0 }); // the barista role, Oct 1
  });

  it("puts overdue actions first and actions above everything in the table", () => {
    const later = app({ company: "Later", action_needed: "Reply", action_due: "2026-11-20" });
    const undated = app({ company: "Undated", action_needed: "Something" });
    const q = actionQueue([undated, later, ...apps]);
    expect(q.map((a) => a.company)).toEqual(["Acme", "Later", "Undated"]);
    expect(sortForTable([...apps, later])[0].action_needed).not.toBe("");
  });

  it("filters and searches", () => {
    expect(applyFilter(apps, "tech", TODAY, 21)).toHaveLength(2);
    expect(applyFilter(apps, "closed", TODAY, 21)).toHaveLength(1);
    expect(applyFilter(apps, "all", TODAY, 21, "barista")).toHaveLength(1);
  });
});

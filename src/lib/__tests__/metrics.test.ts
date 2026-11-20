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
    expect(followUp(app({ status: "Accepted", last_contact: "2026-01-01" }), TODAY, 21)).toBeNull();
  });
  it("still flags an Offer: it is active until it is accepted or declined", () => {
    expect(followUp(app({ status: "Offer", last_contact: "2026-01-01" }), TODAY, 21)).toBe("ghosted");
    expect(followUp(app({ status: "Offer", last_contact: addDays(TODAY, -1) }), TODAY, 21)).toBe("waiting");
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

  it("counts interviews as applications at interview stage, not interviews_done", () => {
    // Deliberate change: the old sum of interviews_done read 0 on the live
    // tracker even with 3 interview-stage applications, because the tracker
    // leaves interviews_done at 0 on almost every row. The count now matches
    // the funnel's Interview step exactly.
    const s = summarize(
      [
        app({ status: "Interviewing", interviews_done: 2 }),
        app({ status: "Offer", interviews_done: 0 }),
        app({ status: "Applied", interviews_done: 3 }),
        app({ status: "Applied", interviews_done: 0 }),
      ],
      TODAY,
      21,
    );
    expect(s.interviews).toBe(3); // interviews_done would have summed to 5
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
    expect(applyFilter(apps, "closed", TODAY, 21)).toHaveLength(0); // the Offer is active, not closed
    expect(applyFilter(apps, "active", TODAY, 21)).toHaveLength(4);
    expect(applyFilter(apps, "all", TODAY, 21, "barista")).toHaveLength(1);
  });
});

describe("tracker status filter and search", () => {
  const filterApps = [
    app({ company: "Nebius", role: "AI/ML Specialist", status: "OA Received", oa_received: true, track: "Internship", notes: "HackerRank submitted, waiting on the GDPR consent click", latest_update: "Assessment submitted", last_contact: "2026-11-10", action_needed: "Complete the GDPR consent click", action_due: "2026-12-09" }),
    app({ company: "Kestrel Fintech", role: "Full Stack Developer (New Grad)", status: "Rejected", interviews_done: 1, track: "New Grad", latest_update: "Rejected after recruiter screen", last_contact: "2026-11-01" }),
    app({ company: "Atlas Robotics", role: "Embedded Software Intern", status: "Interviewing", interviews_done: 2, track: "Internship", notes: "Interviewer: robotics perception team", last_contact: "2026-11-02" }),
    app({ company: "Acme", role: "Barista", status: "Applied", track: "Part-Time", last_contact: "2026-11-05" }),
  ];

  it("filters by one stored status and restores everything on All", () => {
    expect(applyFilter(filterApps, "all", TODAY, 21, "", "OA Received").map((a) => a.company)).toEqual(["Nebius"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "", "Rejected").map((a) => a.company)).toEqual(["Kestrel Fintech"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "", "All")).toHaveLength(4);
    expect(applyFilter(filterApps, "all", TODAY, 21)).toHaveLength(4); // status defaults to All
  });

  it("returns nothing for a status with no rows", () => {
    expect(applyFilter(filterApps, "all", TODAY, 21, "", "Offer")).toHaveLength(0);
  });

  it("composes the status with the chip filter and the search box", () => {
    expect(applyFilter(filterApps, "closed", TODAY, 21, "", "Rejected")).toHaveLength(1);
    expect(applyFilter(filterApps, "closed", TODAY, 21, "", "OA Received")).toHaveLength(0);
    expect(applyFilter(filterApps, "all", TODAY, 21, "kestrel", "Rejected")).toHaveLength(1);
    expect(applyFilter(filterApps, "all", TODAY, 21, "atlas", "Rejected")).toHaveLength(0);
    expect(applyFilter(filterApps, "tech", TODAY, 21, "", "OA Received")).toHaveLength(1);
  });

  it("matches a status word typed in the search box", () => {
    expect(applyFilter(filterApps, "all", TODAY, 21, "rejected").map((a) => a.company)).toEqual(["Kestrel Fintech"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "oa received").map((a) => a.company)).toEqual(["Nebius"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "interviewing").map((a) => a.company)).toEqual(["Atlas Robotics"]);
  });

  it("matches notes, track, latest update, and action text", () => {
    expect(applyFilter(filterApps, "all", TODAY, 21, "perception").map((a) => a.company)).toEqual(["Atlas Robotics"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "gdpr").map((a) => a.company)).toEqual(["Nebius"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "internship").map((a) => a.company)).toEqual(["Nebius", "Atlas Robotics"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "new grad").map((a) => a.company)).toEqual(["Kestrel Fintech"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "recruiter screen").map((a) => a.company)).toEqual(["Kestrel Fintech"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "consent click").map((a) => a.company)).toEqual(["Nebius"]);
  });

  it("matches date words and multi-word queries, case-insensitively", () => {
    expect(applyFilter(filterApps, "all", TODAY, 21, "nov 10").map((a) => a.company)).toEqual(["Nebius"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "  KESTREL ").map((a) => a.company)).toEqual(["Kestrel Fintech"]);
    expect(applyFilter(filterApps, "all", TODAY, 21, "tech jobs")).toHaveLength(3); // the three tech roles, not the barista
    expect(applyFilter(filterApps, "all", TODAY, 21, "robotics perception").map((a) => a.company)).toEqual(["Atlas Robotics"]);
  });
});

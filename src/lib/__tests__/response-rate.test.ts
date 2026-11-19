import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "../demo-data";
import {
  applicationResponseRate,
  contactResponded,
  contactResponseRate,
  hasResponded,
  summarize,
} from "../metrics";
import { demoContacts } from "../pipeline";
import { emptyApplication, STATUSES, type Application, type Contact } from "../types";

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

// The dashboard showed 45% (status-based, 10 of 22) next to "11 replies"
// (date-based: last_contact after date_applied), and the Networking page
// showed no rate at all. Kumail's call, Nov 18: count any forward
// movement, status-based, everywhere. One shared definition now feeds the
// dashboard rate, the dashboard replies count, and the Networking page.

const TODAY = "2026-11-18";

function app(over: Partial<Application> = {}): Application {
  return { ...emptyApplication(TODAY), id: Math.random().toString(36).slice(2), company: "Acme", ...over };
}

function contact(status: string): Contact {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    person_name: "Casey",
    company: "Acme",
    status,
    next_step: "",
    next_step_on: null,
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  };
}

describe("hasResponded (applications)", () => {
  it.each(
    STATUSES.map((s) => [s, s !== "Applied" && s !== "Incomplete"] as const),
  )("%s → %s", (status, expected) => {
    expect(hasResponded(app({ status }))).toBe(expected);
  });

  it("counts a rejection and a withdrawal as responded: the company engaged", () => {
    expect(hasResponded(app({ status: "Rejected" }))).toBe(true);
    expect(hasResponded(app({ status: "Withdrawn" }))).toBe(true);
  });

  it("does not count a later last-contact date on its own", () => {
    // The old date rule counted this row as a reply; the status rule does
    // not, because nothing moved forward. This is the Sable Studio wedge
    // in the demo data: Applied, contacted 12 days after applying.
    const sable = app({ status: "Applied", date_applied: "2026-09-27", last_contact: "2026-10-09" });
    expect(hasResponded(sable)).toBe(false);
    expect(summarize([sable, app({ status: "OA Received" })], TODAY, 21).responseRate).toBeCloseTo(0.5);
  });
});

describe("contactResponded (networking contacts)", () => {
  it.each([
    ["Connected", true],
    ["Connected — thanked Nov 6", true],
    ["Connected — replied Nov 9", true],
    ["Accepted my request", true],
    ["Replied with feedback", true],
    ["Met for coffee", true],
    ["Spoke on the phone", true],
    ["Referred me to the hiring manager", true],
    ["Messaged — awaiting reply", false], // the trap: "reply" in the detail must not count
    ["Awaiting reply", false],
    ["No reply yet", false],
    ["Requested", false],
    ["Requested a reply", false], // outreach that names a reply is still outreach
    ["Messaged", false],
    ["Invited", false],
    ["Ghosted", false],
    ["Replied to my message", true], // forward stage that mentions the outreach
    ["Followed up after our call", true],
    ["", false],
  ])("%s → %s", (status, expected) => {
    expect(contactResponded(contact(status))).toBe(expected);
  });
});

describe("the two views agree", () => {
  it("dashboard and networking render the same rate for the same responded share", () => {
    const apps = [
      app({ status: "OA Received" }),
      app({ status: "Interviewing" }),
      app({ status: "Offer" }),
      app({ status: "Applied" }),
    ];
    const contacts = [
      contact("Connected"),
      contact("Connected — replied Nov 9"),
      contact("Met for coffee"),
      contact("Messaged — awaiting reply"),
    ];
    expect(applicationResponseRate(apps)).toEqual({ responded: 3, total: 4, rate: 0.75 });
    expect(contactResponseRate(contacts)).toEqual({ responded: 3, total: 4, rate: 0.75 });
    expect(Math.round(applicationResponseRate(apps).rate * 100)).toBe(
      Math.round(contactResponseRate(contacts).rate * 100),
    );
  });

  it("summarize's rate is the shared helper's rate, not a second computation", () => {
    const apps = [app({ status: "Applied" }), app({ status: "Rejected" }), app({ status: "Interviewing" })];
    expect(summarize(apps, TODAY, 21).responseRate).toBe(applicationResponseRate(apps).rate);
  });

  it("empty lists read 0%, not NaN", () => {
    expect(applicationResponseRate([])).toEqual({ responded: 0, total: 0, rate: 0 });
    expect(contactResponseRate([])).toEqual({ responded: 0, total: 0, rate: 0 });
  });
});

describe("demo numbers agree", () => {
  it("dashboard: 10 replies of 22 is the 45% rate", () => {
    const apps = demoApplications(TODAY);
    const rate = applicationResponseRate(apps);
    expect(rate).toEqual({ responded: 10, total: 22, rate: 10 / 22 });
    expect(Math.round(rate.rate * 100)).toBe(45);
    expect(summarize(apps, TODAY, 21).responseRate).toBe(rate.rate);
    // The old date rule counted 11; the status rule counts 10. The wedge
    // row is Sable Studio, still at Applied.
    const dateReplies = apps.filter((a) => a.last_contact && a.date_applied && a.last_contact > a.date_applied);
    expect(dateReplies).toHaveLength(11);
    expect(dateReplies.map((a) => a.company)).toContain("Sable Studio");
    expect(apps.filter(hasResponded).map((a) => a.company)).not.toContain("Sable Studio");
  });

  it("networking: 3 of the 4 demo contacts responded", () => {
    expect(contactResponseRate(demoContacts(TODAY))).toEqual({ responded: 3, total: 4, rate: 0.75 });
  });
});

describe("both views read the shared helpers", () => {
  const overview = read("components/dashboard/Overview.tsx");
  const networking = read("components/pipeline/NetworkingSection.tsx");
  const metrics = read("lib/metrics.ts");

  it("the dashboard replies count filters by hasResponded, not by contact dates", () => {
    expect(overview).toContain("apps.filter(hasResponded)");
    expect(overview).not.toContain("last_contact > a.date_applied");
    expect(metrics).toContain("apps.filter(hasResponded).length");
  });

  it("the networking page renders the shared contact rate", () => {
    expect(networking).toContain("contactResponseRate(contacts)");
    expect(networking).toContain("{responseRate.responded} of {responseRate.total} people responded");
    expect(networking).toContain("Math.round(responseRate.rate * 100)}% response rate");
  });
});

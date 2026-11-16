import { describe, expect, it } from "vitest";
import { applicationKey, dedupeImport, filterSheet, sheetRows, sortSheet, SHEET_COLUMNS } from "../sheet";
import { emptyApplication, type Application } from "../types";

const TODAY = "2026-11-11";
const GHOST = 21;

const app = (patch: Partial<Application>): Application => ({
  id: Math.random().toString(36).slice(2),
  ...emptyApplication("2026-10-01"),
  date_applied: "2026-10-01",
  last_contact: "2026-10-01",
  ...patch,
});

describe("sheet columns", () => {
  it("carries the Excel tracker's sixteen columns in order", () => {
    expect(SHEET_COLUMNS.map((c) => c.header)).toEqual([
      "Company", "Role", "Track", "Date Applied", "Status", "Last Contact", "Days Since Contact",
      "Follow-Up Flag", "OA Received", "Interviews Done", "Latest Update", "Email", "Notes",
      "Action Needed", "Action Due", "Tech Role",
    ]);
  });

  it("marks computed columns read-only and tracker fields editable", () => {
    const byKey = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.key, c.editable]));
    expect(byKey.days_quiet).toBeNull();
    expect(byKey.flag).toBeNull();
    expect(byKey.tech).toBeNull();
    expect(byKey.status).toBe("status");
    expect(byKey.oa_received).toBe("bool");
    expect(byKey.interviews_done).toBe("number");
  });
});

describe("sheet row derivation", () => {
  it("works out days quiet, follow-up flag and tech from the application", () => {
    const rows = sheetRows(
      [
        app({ company: "Quiet Co", role: "Software Engineer Intern", last_contact: "2026-10-11" }), // 31 quiet days
        app({ company: "Fresh Co", role: "Barista", last_contact: "2026-11-10", oa_received: true }),
        app({ company: "Done Co", role: "SWE Intern", status: "Rejected", last_contact: "2026-09-01" }),
      ],
      TODAY,
      GHOST,
    );
    expect(rows[0]).toMatchObject({ days_quiet: 31, flag: "ghosted", flagLabel: "GHOSTED - follow up", tech: true });
    expect(rows[0].values.oa_received).toBe("N");
    expect(rows[1]).toMatchObject({ days_quiet: 1, flag: "waiting", tech: false });
    expect(rows[1].values.oa_received).toBe("Y");
    // closed rows never carry a follow-up flag, however quiet they are
    expect(rows[2].flag).toBeNull();
    expect(rows[2].values.flag).toBe("");
  });
});

describe("sheet sorting and filtering", () => {
  const rows = sheetRows(
    [
      app({ company: "Beta", role: "SWE Intern", interviews_done: 1, last_contact: "2026-11-01" }),
      app({ company: "Alpha", role: "SWE Intern", interviews_done: 3, last_contact: "2026-11-05" }),
      app({ company: "Gamma", role: "PM Intern", interviews_done: 0, last_contact: null, action_needed: "Send transcript" }),
    ],
    TODAY,
    GHOST,
  );

  it("sorts text ascending and numbers descending, blanks last", () => {
    expect(sortSheet(rows, "company", "asc").map((r) => r.app.company)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortSheet(rows, "interviews_done", "desc").map((r) => r.app.company)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(sortSheet(rows, "last_contact", "desc")[2].app.company).toBe("Gamma"); // no date sorts last
  });

  it("filters by text and by waiting-on-you", () => {
    expect(filterSheet(rows, "alpha").map((r) => r.app.company)).toEqual(["Alpha"]);
    expect(filterSheet(rows, "", true).map((r) => r.app.company)).toEqual(["Gamma"]);
    expect(filterSheet(rows, "intern")).toHaveLength(3);
  });
});

describe("status filter", () => {
  const rows = sheetRows(
    [
      app({ company: "Nebius", role: "AI/ML Specialist", status: "OA Received", oa_received: true, last_contact: "2026-11-10", action_needed: "Complete the GDPR consent click", action_due: "2026-12-09" }),
      app({ company: "Acme", role: "SWE Intern", status: "Applied", last_contact: "2026-11-10" }),
      app({ company: "Beta", role: "SWE Intern", status: "OA Received", oa_received: true, last_contact: "2026-11-09", action_needed: "Finish the coding assessment" }),
      app({ company: "Gamma", role: "SWE Intern", status: "Interviewing", interviews_done: 1, last_contact: "2026-11-12" }),
      app({ company: "Delta", role: "SWE Intern", status: "Rejected", last_contact: "2026-11-01" }),
    ],
    TODAY,
    GHOST,
  );

  it("shows only the selected status and restores everything on All", () => {
    expect(filterSheet(rows, "", false, "OA Received").map((r) => r.app.company)).toEqual(["Nebius", "Beta"]);
    expect(filterSheet(rows, "", false, "Interviewing").map((r) => r.app.company)).toEqual(["Gamma"]);
    expect(filterSheet(rows, "", false, "Rejected").map((r) => r.app.company)).toEqual(["Delta"]);
    expect(filterSheet(rows, "", false, "All")).toHaveLength(5);
    expect(filterSheet(rows, "")).toHaveLength(5); // status defaults to All
  });

  it("composes with the text search and the waiting-on-you flag", () => {
    expect(filterSheet(rows, "neb", false, "OA Received").map((r) => r.app.company)).toEqual(["Nebius"]);
    expect(filterSheet(rows, "acme", false, "OA Received")).toHaveLength(0); // Acme is Applied, not OA Received
    expect(filterSheet(rows, "", true, "OA Received").map((r) => r.app.company)).toEqual(["Nebius", "Beta"]);
  });
});

describe("global filter matches every column", () => {
  const rows = sheetRows(
    [
      app({
        company: "Nimbus",
        role: "Software Engineer Intern",
        track: "New Grad",
        status: "Interviewing",
        date_applied: "2026-11-03",
        last_contact: "2026-11-10",
        oa_received: true,
        interviews_done: 2,
        latest_update: "Recruiter replied",
        link: "https://job-boards.greenhouse.io/nimbus/jobs/1",
        notes: "Met the hiring manager at the career fair",
        action_needed: "Schedule the onsite",
        action_due: "2026-11-20",
      }),
      app({
        company: "Acme",
        role: "Product Designer",
        track: "Internship",
        status: "Applied",
        date_applied: "2026-10-20",
        last_contact: "2026-10-01",
      }),
      app({
        company: "Halo",
        role: "Marketing Intern",
        track: "Part-Time",
        status: "Rejected",
        date_applied: "2026-09-15",
        last_contact: "2026-09-20",
        notes: "Campus ambassador program",
      }),
    ],
    TODAY,
    GHOST,
  );
  const companies = (q: string) => filterSheet(rows, q).map((r) => r.app.company);

  it("finds tech roles from 'tech jobs'", () => {
    expect(companies("tech jobs")).toEqual(["Nimbus"]);
    expect(companies("TECH")).toEqual(["Nimbus"]);
  });

  it("matches track, status, and flag", () => {
    expect(companies("new grad")).toEqual(["Nimbus"]);
    expect(companies("interview")).toEqual(["Nimbus"]);
    expect(companies("ghosted")).toEqual(["Acme"]);
  });

  it("matches dates by month name, month number, and year", () => {
    expect(companies("nov")).toEqual(["Nimbus"]);
    expect(companies("nov 20")).toEqual(["Nimbus"]);
    expect(companies("2026-11")).toEqual(["Nimbus"]);
  });

  it("matches link, notes, and action needed", () => {
    expect(companies("greenhouse")).toEqual(["Nimbus"]);
    expect(companies("career fair")).toEqual(["Nimbus"]);
    expect(companies("schedule onsite")).toEqual(["Nimbus"]);
  });

  it("matches OA and interview counts", () => {
    expect(companies("oa received")).toEqual(["Nimbus"]);
    expect(companies("interviews 2")).toEqual(["Nimbus"]);
    expect(companies("oa")).toEqual(["Nimbus"]);
  });

  it("treats a stopword-only query as no filter", () => {
    expect(companies("jobs")).toHaveLength(3);
    expect(companies("")).toHaveLength(3);
  });
});

describe("import dedupe", () => {
  const existing = [app({ company: "Stripe", role: "SWE Intern", date_applied: "2026-10-01" })];

  it("keys on company + role + date applied, case-insensitively", () => {
    expect(applicationKey({ company: " Stripe ", role: "swe intern", date_applied: "2026-10-01" })).toBe(
      applicationKey(existing[0]),
    );
  });

  it("splits fresh rows from duplicates, including repeats inside the file", () => {
    const rows = [
      { ...emptyApplication(TODAY), company: "Stripe", role: "SWE Intern", date_applied: "2026-10-01" }, // dup of existing
      { ...emptyApplication(TODAY), company: "New Co", role: "SWE Intern", date_applied: "2026-11-01" }, // fresh
      { ...emptyApplication(TODAY), company: "new co", role: "SWE Intern", date_applied: "2026-11-01" }, // dup within file
      { ...emptyApplication(TODAY), company: "Stripe", role: "SWE Intern", date_applied: "2026-10-02" }, // different date = fresh
    ];
    const { fresh, duplicates } = dedupeImport(rows, existing);
    expect(fresh.map((r) => `${r.company}@${r.date_applied}`)).toEqual(["New Co@2026-11-01", "Stripe@2026-10-02"]);
    expect(duplicates).toHaveLength(2);
  });
});

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

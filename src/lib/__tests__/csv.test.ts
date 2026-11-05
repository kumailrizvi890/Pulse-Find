import { describe, expect, it } from "vitest";
import { importCsv, normalizeStatus, normalizeTrack, parseDate } from "../csv";
import { toCsv } from "../export";
import { demoApplications } from "../demo-data";

describe("parseDate", () => {
  it.each([
    ["2026-10-28", "2026-10-28"],
    ["10/28/2026", "2026-10-28"],
    ["10/28/26", "2026-10-28"],
    ["Oct 28, 2026", "2026-10-28"],
    ["28 October 2026", "2026-10-28"],
    ["2026-02-30", null],
    ["soon", null],
    ["", null],
  ])("%s → %s", (raw, expected) => expect(parseDate(raw)).toBe(expected));
});

describe("normalizers", () => {
  it("maps loose status words", () => {
    expect(normalizeStatus("rejection")).toBe("Rejected");
    expect(normalizeStatus("PHONE SCREEN")).toBe("Recruiter Screen");
    expect(normalizeStatus("Final Round")).toBe("Final Round");
    expect(normalizeStatus("who knows")).toBe("Applied");
  });
  it("infers a track from the role when the column is empty", () => {
    expect(normalizeTrack("", "SWE Intern")).toBe("Internship");
    expect(normalizeTrack("", "Software Engineer, Early Career")).toBe("New Grad");
    expect(normalizeTrack("part time")).toBe("Part-Time");
  });
});

describe("importCsv", () => {
  it("reads a tracker with its own column names", () => {
    const csv = [
      "﻿Employer,Position,Stage,Applied On,OA Received (Y/N),Next Step,Deadline,Link",
      'Northwind,"Software Engineer Intern, 2027",Assessment,10/20/2026,Y,Finish HackerRank,Nov 7 2026,https://example.com/a',
      ",Missing company row,Applied,,,,,",
      "Brightwater,Data Analyst,applied,2026-10-01,,,,not-a-url",
    ].join("\n");
    const r = importCsv(csv, "2026-11-05");
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toEqual([{ line: 3, reason: "Missing company" }]);
    const [a, b] = r.rows;
    expect(a).toMatchObject({
      company: "Northwind",
      role: "Software Engineer Intern, 2027",
      status: "OA Received",
      oa_received: true,
      track: "Internship",
      date_applied: "2026-10-20",
      last_contact: "2026-10-20",
      action_needed: "Finish HackerRank",
      action_due: "2026-11-07",
      link: "https://example.com/a",
    });
    expect(b.link).toBe(""); // non-http links are dropped
  });

  it("explains a missing company column", () => {
    const r = importCsv("Role,Status\nIntern,Applied");
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/Company/);
  });

  it("round-trips its own CSV export", () => {
    const apps = demoApplications("2026-11-05");
    const back = importCsv(toCsv(apps), "2026-11-05").rows;
    expect(back).toHaveLength(apps.length);
    expect(back.map((r) => r.company)).toEqual(apps.map((a) => a.company));
    expect(back.map((r) => r.status)).toEqual(apps.map((a) => a.status));
  });

  it("neutralises spreadsheet formulas on export", () => {
    const [a] = demoApplications("2026-11-05");
    expect(toCsv([{ ...a, notes: "=HYPERLINK(\"x\")" }])).toContain("'=HYPERLINK");
  });
});

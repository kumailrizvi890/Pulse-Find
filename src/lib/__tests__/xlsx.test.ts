import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "../export";
import { importXlsx } from "../xlsx";
import { dedupeImport } from "../sheet";
import { DEFAULT_SETTINGS, emptyApplication, type Application } from "../types";

const TODAY = "2026-11-11";

const app = (patch: Partial<Application>): Application => ({
  id: Math.random().toString(36).slice(2),
  ...emptyApplication("2026-10-01"),
  date_applied: "2026-10-01",
  last_contact: "2026-10-01",
  ...patch,
});

describe("xlsx export → import round trip", () => {
  it("exports the tracker columns and reads them straight back", async () => {
    const apps = [
      app({
        company: "Stripe", role: "Software Engineer Intern", track: "Internship", status: "OA Received",
        date_applied: "2026-10-03", last_contact: "2026-11-02", oa_received: true, interviews_done: 1,
        latest_update: "Assessment sent", link: "https://stripe.com/jobs/1", notes: "Referral from Sam",
        action_needed: "Finish the OA", action_due: "2026-11-09",
      }),
      app({
        company: "Local Bakery", role: "Barista", track: "Part-Time", status: "Applied",
        date_applied: "2026-11-01", last_contact: "2026-11-01", link: "jobs@bakery.example",
      }),
    ];
    const buf = await buildWorkbook(apps, DEFAULT_SETTINGS, TODAY);
    const result = await importXlsx(buf as ArrayBuffer, TODAY);

    expect(result.skipped).toEqual([]);
    expect(result.rows).toHaveLength(2);
    const stripe = result.rows.find((r) => r.company === "Stripe")!;
    expect(stripe).toMatchObject({
      role: "Software Engineer Intern",
      track: "Internship",
      status: "OA Received",
      date_applied: "2026-10-03",
      last_contact: "2026-11-02",
      oa_received: true,
      interviews_done: 1,
      latest_update: "Assessment sent",
      link: "https://stripe.com/jobs/1",
      notes: "Referral from Sam",
      action_needed: "Finish the OA",
      action_due: "2026-11-09",
    });
    // the Email column holds an address here; it survives the trip too
    expect(result.rows.find((r) => r.company === "Local Bakery")!.link).toBe("jobs@bakery.example");
  });

  it("re-importing an export dedupes to zero fresh rows", async () => {
    const apps = [app({ company: "Stripe", role: "SWE Intern", date_applied: "2026-10-03" })];
    const buf = await buildWorkbook(apps, DEFAULT_SETTINGS, TODAY);
    const { rows } = await importXlsx(buf as ArrayBuffer, TODAY);
    const { fresh, duplicates } = dedupeImport(rows, apps);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });
});

describe("xlsx import of a user's own tracker sheet", () => {
  it("maps the Excel tracker's headers, including computed columns it ignores", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Applications");
    ws.addRow([
      "Company", "Role", "Track", "Date Applied", "Status", "Last Contact", "Days Since Contact",
      "Follow-Up Flag", "OA Received", "Interviews Done", "Latest Update", "Email", "Notes",
      "Action Needed", "Action Due", "Tech Role",
    ]);
    ws.addRow([
      "Databricks", "Software Engineer, New Grad", "New Grad", new Date(Date.UTC(2026, 10, 11)), "Applied",
      new Date(Date.UTC(2026, 10, 11)), 0, "Waiting", "N", 0, "Submitted via Greenhouse",
      "recruiting@databricks.example", "", "", null, "Tech",
    ]);
    ws.addRow([
      "Nebius", "ML Solution Architect", "Internship", "11/6/2026", "OA Received", "11/6/2026", 5,
      "Follow up soon", "Y", 0, "HackerRank invite", "", "Due Nov 13", "Complete the HackerRank", "11/13/2026", "Tech",
    ]);
    const buf = await wb.xlsx.writeBuffer();

    const result = await importXlsx(buf as unknown as ArrayBuffer, TODAY);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      company: "Databricks", track: "New Grad", status: "Applied", date_applied: "2026-11-11",
      oa_received: false, link: "recruiting@databricks.example",
    });
    expect(result.rows[1]).toMatchObject({
      company: "Nebius", status: "OA Received", oa_received: true,
      action_needed: "Complete the HackerRank", action_due: "2026-11-13",
    });
  });

  it("reports a clear skip when no sheet has a Company column", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Summary").addRow(["Pulse Find export", ""]);
    const buf = await wb.xlsx.writeBuffer();
    const result = await importXlsx(buf as unknown as ArrayBuffer, TODAY);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/Company column/);
  });
});

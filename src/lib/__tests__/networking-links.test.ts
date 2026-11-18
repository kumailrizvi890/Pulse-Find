import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { isExternalUrl } from "../pipeline";
import { buildContactSyncPlan, contactKey } from "../sync-sheet";
import type { Contact, ContactInput } from "../types";
import { importNetworkingXlsx } from "../xlsx";

function existingContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "1",
    person_name: "Subburaj Gurusamy",
    company: "Amazon",
    status: "Connected",
    next_step: "",
    next_step_on: null,
    notes: "",
    linkedin_url: "",
    last_contacted: null,
    ...overrides,
  };
}

function incomingContact(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    person_name: "Subburaj Gurusamy",
    company: "Amazon",
    status: "Connected",
    next_step: "",
    next_step_on: null,
    notes: "",
    linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
    last_contacted: "2026-10-26",
    ...overrides,
  };
}

describe("contactKey", () => {
  it("lowercases and trims the parts", () => {
    expect(contactKey(" Subburaj Gurusamy ", " Amazon ")).toBe("subburaj gurusamy::amazon");
  });

  it("treats the same person at a different company as a different contact", () => {
    expect(contactKey("Sam Ortiz", "Fernhill")).not.toBe(contactKey("Sam Ortiz", "Copperline"));
  });
});

describe("buildContactSyncPlan", () => {
  it("creates contacts that are missing", () => {
    const plan = buildContactSyncPlan([], [incomingContact()]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      person_name: "Subburaj Gurusamy",
      linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
      last_contacted: "2026-10-26",
    });
    expect(plan.updates).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it("updates a drifted URL and last-contacted date and nothing else", () => {
    const plan = buildContactSyncPlan([existingContact()], [incomingContact()]);
    expect(plan.creates).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]?.id).toBe("1");
    expect(plan.updates[0]?.patch).toEqual({
      linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
      last_contacted: "2026-10-26",
    });
  });

  it("plans no writes for identical rows", () => {
    const plan = buildContactSyncPlan(
      [existingContact({ linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922", last_contacted: "2026-10-26" })],
      [incomingContact()],
    );
    expect(plan).toEqual({ creates: [], updates: [], skipped: 0 });
  });

  it("never lets a blank tracker value wipe a URL or date entered by hand", () => {
    const plan = buildContactSyncPlan(
      [existingContact({ linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922", last_contacted: "2026-10-26" })],
      [incomingContact({ linkedin_url: "", last_contacted: null, status: "Requested" })],
    );
    expect(plan.updates).toHaveLength(1);
    // Only the status drifts; the URL and date stay exactly as they were.
    expect(plan.updates[0]?.patch).toEqual({ status: "Requested" });
  });

  it("skips a repeated tracker row instead of creating it twice", () => {
    const plan = buildContactSyncPlan([], [incomingContact(), incomingContact()]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });

  it("leaves an app contact alone when the tracker has no row for them", () => {
    const plan = buildContactSyncPlan([existingContact()], [incomingContact({ person_name: "Someone Else", company: "Globex" })]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
  });
});

describe("importNetworkingXlsx", () => {
  const HEADERS = [
    "Name", "Company", "Their Role", "Type", "Profile URL", "Request Sent", "Accepted",
    "Note / Hook", "Last Touch", "Next Step", "Next Step Date", "Status",
  ];

  it("maps the Networking Tracker's real headers, including date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Connections");
    ws.addRow(HEADERS);
    ws.addRow([
      "Subburaj Gurusamy", "Amazon", "Employee", "Referrer", "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
      "2026-10-25", "2026-10-27", "Referred all three SDE Intern roles", new Date(Date.UTC(2026, 9, 26)),
      "Message only on genuine new news", "2026-11-17", "Connected",
    ]);
    ws.addRow([
      "Marc Dupuis", "UW Bothell", "Contact", "Peer", "", "", "",
      "", "11/4/2026", "", "", "Connected",
    ]);
    const buf = await wb.xlsx.writeBuffer();

    const result = await importNetworkingXlsx(buf as unknown as ArrayBuffer);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      person_name: "Subburaj Gurusamy",
      company: "Amazon",
      status: "Connected",
      notes: "Referred all three SDE Intern roles",
      linkedin_url: "https://www.linkedin.com/in/subburaj-gurusamy-a673a922",
      last_contacted: "2026-10-26",
      next_step: "Message only on genuine new news",
      next_step_on: "2026-11-17",
    });
    expect(result.rows[1]).toMatchObject({
      person_name: "Marc Dupuis",
      linkedin_url: "",
      last_contacted: "2026-11-04",
    });
    expect(result.skipped).toHaveLength(0);
  });

  it("drops a Profile URL that is not a link and skips a nameless row", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Connections");
    ws.addRow(HEADERS);
    ws.addRow(["No Link Nora", "Globex", "", "", "not a url", "", "", "", "", "", "", "Queued"]);
    ws.addRow(["", "Globex", "", "", "https://www.linkedin.com/in/ghost", "", "", "", "", "", "", "Queued"]);
    const buf = await wb.xlsx.writeBuffer();

    const result = await importNetworkingXlsx(buf as unknown as ArrayBuffer);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.linkedin_url).toBe("");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/Missing name/);
  });

  it("reports a clear skip when no sheet has a Name column", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Summary").addRow(["Pulse Find export", ""]);
    const buf = await wb.xlsx.writeBuffer();

    const result = await importNetworkingXlsx(buf as unknown as ArrayBuffer);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/Name column/);
  });
});

describe("isExternalUrl", () => {
  it("accepts http and https links", () => {
    expect(isExternalUrl("https://www.linkedin.com/in/priya-nair")).toBe(true);
    expect(isExternalUrl("http://example.com/x")).toBe(true);
  });

  it("rejects bare text, empty strings, and javascript: links", () => {
    expect(isExternalUrl("not a url")).toBe(false);
    expect(isExternalUrl("")).toBe(false);
    expect(isExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isExternalUrl("linkedin.com/in/priya-nair")).toBe(false);
  });
});

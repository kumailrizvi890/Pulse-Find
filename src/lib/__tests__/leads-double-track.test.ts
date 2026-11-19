import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canPromoteLead, demoPipelineStore, isAlreadyTracked, leadKey } from "../pipeline";
import { demoApplications } from "../demo-data";
import type { Application, Lead } from "../types";

// Leads double-track gap (pass-22 live audit): on /demo/leads and the
// signed-in /app/leads, promote() created a tracker application with no
// check at all, so a lead whose company + role was already tracked
// offered "I applied - track it" and a second tap made a duplicate row.
// The same button also showed on leads that cannot be applied to
// (Not eligible, Closed, Problem).
//
// What the demo seed actually shows, pinned here so a future seed edit
// cannot silently reintroduce the gap:
// - Westfield Labs / Software Engineer Intern is the ONE exact duplicate:
//   the lead (Queued) and a tracker application share the same company +
//   role key.
// - Copperline and Brightwater share a COMPANY with a tracker application
//   but a DIFFERENT role, so they are genuinely new applications. Matching
//   on company alone would wrongly block a second role at the same company.
// - Atlas Robotics (Problem, posting closed) and Fernhill Capital
//   (Not eligible, requires a masters) are the cannot-apply cases; the
//   seed keeps those statuses, the button rule covers them.
const TODAY = "2026-11-11";

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

function app(company: string, role: string): Pick<Application, "company" | "role"> {
  return { company, role };
}

function lead(company: string, role: string, status: Lead["status"]): Lead {
  return {
    id: "l1", company, role, track: "Internship", location: "", pay: "", url: "",
    source: "", status, fit_note: "", date_found: TODAY, created_at: "", updated_at: "",
  };
}

describe("isAlreadyTracked", () => {
  it("matches on company + role, ignoring case and padding", () => {
    const apps = [app("Westfield Labs", "Software Engineer Intern")];
    expect(isAlreadyTracked(apps, { company: " westfield labs ", role: "software engineer intern" })).toBe(true);
    expect(isAlreadyTracked(apps, { company: "Westfield Labs", role: "Software Engineer Intern" })).toBe(true);
  });

  it("does not match a different role at the same company", () => {
    const apps = [app("Copperline", "Associate AI Engineer (New Grad)")];
    expect(isAlreadyTracked(apps, { company: "Copperline", role: "Machine Learning Intern" })).toBe(false);
  });

  it("does not match the same role at a different company", () => {
    const apps = [app("Westfield Labs", "Software Engineer Intern")];
    expect(isAlreadyTracked(apps, { company: "Northwind Labs", role: "Software Engineer Intern" })).toBe(false);
  });

  it("is false with no applications", () => {
    expect(isAlreadyTracked([], { company: "Westfield Labs", role: "Software Engineer Intern" })).toBe(false);
  });
});

describe("canPromoteLead", () => {
  it("allows New and Queued leads that are not tracked yet", () => {
    expect(canPromoteLead(lead("Copperline", "Machine Learning Intern", "New"), [])).toBe(true);
    expect(canPromoteLead(lead("Westfield Labs", "Software Engineer Intern", "Queued"), [])).toBe(true);
  });

  it("blocks a lead whose company + role is already tracked", () => {
    const apps = [app("Westfield Labs", "Software Engineer Intern")];
    expect(canPromoteLead(lead("Westfield Labs", "Software Engineer Intern", "Queued"), apps)).toBe(false);
    expect(canPromoteLead(lead("Westfield Labs", "Software Engineer Intern", "New"), apps)).toBe(false);
  });

  it("blocks Applied, Problem, Not eligible and Closed leads", () => {
    for (const status of ["Applied", "Problem", "Not eligible", "Closed"] as const) {
      expect(canPromoteLead(lead("Test Co", "SWE Intern", status), [])).toBe(false);
    }
  });
});

describe("demo seed: which leads are already tracked", () => {
  it("Westfield is the one exact company + role duplicate in the demo tracker", async () => {
    const leads = await demoPipelineStore(TODAY).loadLeads();
    const apps = demoApplications(TODAY);
    const appKeys = new Set(apps.map((a) => leadKey(a)));
    const westfield = leads.find((l) => l.company === "Westfield Labs");
    expect(westfield).toBeDefined();
    expect(appKeys.has(leadKey(westfield!))).toBe(true);
    expect(canPromoteLead(westfield!, apps)).toBe(false);
  });

  it("Copperline and Brightwater leads are different roles, so they still promote", async () => {
    const leads = await demoPipelineStore(TODAY).loadLeads();
    const apps = demoApplications(TODAY);
    const appKeys = new Set(apps.map((a) => leadKey(a)));
    for (const company of ["Copperline", "Brightwater Health"]) {
      const l = leads.find((x) => x.company === company);
      expect(l).toBeDefined();
      expect(appKeys.has(leadKey(l!))).toBe(false);
      expect(canPromoteLead(l!, apps)).toBe(true);
    }
  });

  it("Atlas (closed posting) and Fernhill (not eligible) keep their statuses and do not promote", async () => {
    const leads = await demoPipelineStore(TODAY).loadLeads();
    const apps = demoApplications(TODAY);
    const atlas = leads.find((l) => l.company === "Atlas Robotics");
    const fernhill = leads.find((l) => l.company === "Fernhill Capital");
    expect(atlas?.status).toBe("Problem");
    expect(fernhill?.status).toBe("Not eligible");
    expect(canPromoteLead(atlas!, apps)).toBe(false);
    expect(canPromoteLead(fernhill!, apps)).toBe(false);
  });

  it("the Applied lead still shows as in the tracker, not as promotable", async () => {
    const leads = await demoPipelineStore(TODAY).loadLeads();
    const apps = demoApplications(TODAY);
    const tidewater = leads.find((l) => l.company === "Tidewater Cloud");
    expect(tidewater?.status).toBe("Applied");
    expect(canPromoteLead(tidewater!, apps)).toBe(false);
  });
});

describe("LeadsSection double-track guard (source pins)", () => {
  const section = read("components/pipeline/LeadsSection.tsx");

  it("loads the tracker applications so the page knows what is already tracked", () => {
    expect(section).toContain("const [trackedApps, setTrackedApps] = useState<Application[]>([]);");
    expect(section).toContain("tracker");
    expect(section).toContain(".load()");
    expect(section).toContain("setTrackedApps(apps)");
  });

  it("shows In tracker instead of the promote button for a tracked lead", () => {
    expect(section).toContain("isAlreadyTracked(trackedApps, l) ? (");
    expect(section).toContain('<Tag tone="muted">In tracker</Tag>');
    // One label for the same state: a Queued lead that is already tracked
    // used to read "Already tracked" while an Applied lead read
    // "In tracker". Both now read "In tracker".
    expect(section).not.toContain("Already tracked");
  });

  it("gates the promote button on New or Queued leads that are not tracked", () => {
    expect(section).toContain("canPromoteLead(l, trackedApps) ? (");
  });

  it("re-checks the tracker fresh inside promote() before creating, so a background sync cannot slip a duplicate in", () => {
    const promoteStart = section.indexOf("async function promote");
    const promoteEnd = section.indexOf("async function save");
    const promote = section.slice(promoteStart, promoteEnd);
    expect(promote).toContain("isAlreadyTracked(trackedApps, l)");
    expect(promote).toContain("fresh = (await tracker.load()).apps;");
    expect(promote).toContain("isAlreadyTracked(fresh, l)");
    expect(promote).toContain("setTrackedApps((p) => [made, ...p]);");
    expect(promote).toContain("is already in your tracker.");
  });

  it("uses a hyphen, not an em dash, in the promote button label", () => {
    expect(section).toContain("I applied - track it");
    // The old label, written as a unicode escape so this file holds no literal em dash.
    expect(section).not.toContain("I applied \u2014 track it");
  });
});

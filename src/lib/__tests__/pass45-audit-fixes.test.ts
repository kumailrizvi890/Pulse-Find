import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoContacts, demoPipelineStore } from "../pipeline";

// Pass-45 fixes (Wed Nov 18, 2026). Two findings from the fresh-eyes
// desktop audit of the public demo (1920px, read-only).
// 1. The demo networking contacts linked their names to real people's
//    LinkedIn profiles (linkedin.com/in/priya-nair, /marcus-webb,
//    /elena-brooks) — invented roles attached to real, identifiable
//    people, and a click threw the visitor out to LinkedIn's sign-in
//    wall. The demo seeds now carry no LinkedIn URL at all, so names
//    render as plain text, exactly like Sam Ortiz already did. Signed-in
//    users keep their own URLs: the NetworkingSection link only renders
//    when a contact actually has one.
// 2. The dashboard Export menu could not be dismissed: it closed only
//    on mouse-leave or by choosing an export, so it sat open over the
//    Networking Follow-ups heading through Escape, outside clicks, and
//    tab switches. It now closes on Escape and on any click outside
//    the menu (transparent backdrop), as well as the existing paths.

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const pipelineSrc = read("lib/pipeline.ts");
const dashboardSrc = read("components/dashboard/Dashboard.tsx");
const networkingSrc = read("components/pipeline/NetworkingSection.tsx");

describe("demo contacts carry no LinkedIn URL", () => {
  it("leaves every demo contact without a link", async () => {
    const contacts = demoContacts("2026-11-18");
    expect(contacts).toHaveLength(4);
    for (const c of contacts) {
      expect(c.linkedin_url).toBe("");
    }
  });

  it("keeps the same four contacts, companies, and notes", async () => {
    const contacts = demoContacts("2026-11-18");
    expect(contacts.map((c) => `${c.person_name} · ${c.company}`)).toEqual([
      "Priya Nair · Copperline",
      "Marcus Webb · Atlas Robotics",
      "Elena Brooks · Westfield Labs",
      "Sam Ortiz · Fernhill Capital",
    ]);
    expect(contacts[0]?.notes).toBe("Recruiter, university programs");
    expect(contacts[1]?.notes).toBe("Hiring manager, perception team");
    expect(contacts[2]?.notes).toBe("Engineer, UW alum");
  });

  it("reaches the same contacts through the demo store", async () => {
    const store = demoPipelineStore("2026-11-18");
    const contacts = await store.loadContacts();
    expect(contacts.every((c) => c.linkedin_url === "")).toBe(true);
  });

  it("has no linkedin.com slug left in the demo seed", () => {
    const block = pipelineSrc.slice(
      pipelineSrc.indexOf("export function demoContacts"),
      pipelineSrc.indexOf("const PICK_LEAD_PREFIX"),
    );
    expect(block).not.toContain("linkedin.com/in/");
  });
});

describe("signed-in contacts still link out", () => {
  it("renders the link only when the contact has a URL", () => {
    expect(networkingSrc).toContain("c.linkedin_url && isExternalUrl(c.linkedin_url)");
    expect(networkingSrc).toContain('href={c.linkedin_url}');
  });

  it("renders plain text when there is no URL", () => {
    expect(networkingSrc).toContain("<span className={cx(\"font-semibold\"");
  });
});

describe("Export menu dismisses", () => {
  function exportMenu(): string {
    return dashboardSrc.slice(
      dashboardSrc.indexOf("function ExportMenu"),
      dashboardSrc.indexOf("function SettingsDialog"),
    );
  }

  it("closes on Escape", () => {
    const menu = exportMenu();
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain('document.addEventListener("keydown", onKey)');
    expect(menu).toContain('document.removeEventListener("keydown", onKey)');
  });

  it("closes on a click outside the menu", () => {
    const menu = exportMenu();
    expect(menu).toContain('aria-label="Close export menu"');
    expect(menu).toContain('className="fixed inset-0 z-20 cursor-default"');
    expect(menu).toContain("onClick={() => setOpen(false)}");
  });

  it("keeps the menu above its backdrop and the toggle working", () => {
    const menu = exportMenu();
    expect(menu).toContain('className="absolute right-0 z-30');
    expect(menu).toContain("onClick={() => setOpen((o) => !o)}");
    expect(menu).toContain("aria-expanded={open}");
  });

  it("still offers both exports, closing on choose", () => {
    const menu = exportMenu();
    expect(menu).toContain("Excel (.xlsx) with colors");
    expect(menu).toContain("CSV");
    expect(menu).toContain("onXlsx()");
    expect(menu).toContain("onCsv()");
  });
});

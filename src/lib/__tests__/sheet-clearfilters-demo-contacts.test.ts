import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two small UX gaps from the pass-13 audit.
//
// 1. Sheet zero-result filter: when the sheet's filters produced zero
// rows, the sheet only said "No rows match this filter." with no way
// back: the user had to clear the search box, the status select and
// the "Waiting on you" toggle one by one. The empty state now offers
// a "Clear filters" button that resets all three at once.
//
// 2. Demo dashboard strands the 4th contact: the Networking Follow-ups
// panel shows the first three contacts, and signed-in dashboards get
// a "See all N contacts" link to /app/networking, but the signed-out
// demo had no link at all, so the 4th demo contact (Sam Ortiz) was
// unreachable from the dashboard. The link now renders in both modes,
// pointing at /demo/networking when signed out.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const sheet = read("components/dashboard/SheetView.tsx");
const overview = read("components/dashboard/Overview.tsx");
const pipeline = read("lib/pipeline.ts");

describe("sheet zero-result Clear filters", () => {
  it("shows a Clear filters button in the zero-result state", () => {
    expect(sheet).toContain("No rows match this filter.");
    expect(sheet).toContain("Clear filters");
    expect(sheet).toContain("<button");
  });

  it("resets the search, the status filter and the waiting toggle together", () => {
    const start = sheet.indexOf("Clear filters");
    const button = sheet.slice(sheet.lastIndexOf("<button", start), start);
    expect(button).toContain('setQuery("")');
    expect(button).toContain('setStatus("All")');
    expect(button).toContain("setOnlyActions(false)");
  });

  it("only offers the button when filters produced zero rows, not on an empty tracker", () => {
    expect(sheet).toContain("{apps.length > 0 && (");
    expect(sheet).toContain("Nothing here yet. Import your Excel sheet or add applications on the Tracker tab.");
  });

  it("keeps the footer row count so the reset is visible", () => {
    expect(sheet).toContain("Showing {rows.length} of {apps.length} rows");
  });
});

describe("demo dashboard See all contacts link", () => {
  it("renders the link for the demo dashboard, pointing at /demo/networking", () => {
    expect(overview).toContain('href={userId ? "/app/networking" : "/demo/networking"}');
  });

  it("keeps the signed-in link exactly as it was, same text and styling", () => {
    expect(overview).toContain("See all {orderedContacts.length} contacts");
    const start = overview.indexOf("See all {orderedContacts.length} contacts");
    const block = overview.slice(Math.max(0, start - 220), start);
    expect(block).toContain('href={userId ? "/app/networking" : "/demo/networking"}');
    expect(block).toContain('className={cx(btn.ghost, "mt-3")}');
  });

  it("shows the link whenever more than three contacts exist, signed in or not", () => {
    expect(overview).toContain("{orderedContacts.length > 3 && (");
    expect(overview).not.toContain("orderedContacts.length > 3 && userId");
  });

  it("only shows the first three contacts in the panel, so the link is the path to the rest", () => {
    expect(overview).toContain("const shownContacts = orderedContacts.slice(0, 3);");
  });

  it("the demo seed has a fourth contact, so the link actually appears on /demo", () => {
    expect(pipeline).toContain('person_name: "Sam Ortiz"');
    expect(pipeline).toContain('person_name: "Priya Nair"');
    expect(pipeline).toContain('person_name: "Marcus Webb"');
    expect(pipeline).toContain('person_name: "Elena Brooks"');
  });
});

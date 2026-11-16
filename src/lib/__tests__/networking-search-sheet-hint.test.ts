import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two small UX gaps from the pass-13 audit.
//
// 1. Networking search scope: on the Networking page the search only
// matched name, company and status, so typing a word from a contact's
// next step ("portfolio") or notes ("perception") found nobody. The
// filter now also matches next-step text and notes, case-insensitive
// like the rest.
//
// 2. Sheet inline-edit hint on touch: the "Click to edit" hint in empty
// editable cells only appeared on hover, so touch users never saw it.
// On coarse pointers the hint now shows instead of the dash, through a
// hover none media query. Desktop hover behaviour is unchanged.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const networking = read("components/pipeline/NetworkingSection.tsx");
const sheet = read("components/dashboard/SheetView.tsx");
const globals = read("app/globals.css");
const pipeline = read("lib/pipeline.ts");

describe("networking search scope", () => {
  it("matches next-step text and notes as well as name, company and status", () => {
    expect(networking).toContain(
      "`${c.person_name} ${c.company} ${c.status} ${c.next_step} ${c.notes}`.toLowerCase().includes(q)",
    );
  });

  it("stays case-insensitive by lowercasing the query and the haystack", () => {
    expect(networking).toContain("const q = query.trim().toLowerCase();");
  });

  it("keeps the search box labelled for people", () => {
    expect(networking).toContain('aria-label="Search people"');
    expect(networking).toContain('placeholder="Search people"');
  });

  it("the demo seed has a next-step-only word and a notes-only word to search for", () => {
    expect(pipeline).toContain("one fix on the portfolio");
    expect(pipeline).toContain("Hiring manager, perception team");
  });
});

describe("sheet edit hint on touch", () => {
  it("shows the hint instead of the dash on coarse pointers", () => {
    expect(sheet).toContain('className="text-faint group-hover:hidden touch-edit-dash"');
    expect(sheet).toContain('className="hidden text-faint group-hover:inline touch-edit-hint">Click to edit</span>');
  });

  it("keeps the desktop hover swap so nothing changes with a mouse", () => {
    expect(sheet).toContain("group-hover:hidden");
    expect(sheet).toContain("group-hover:inline");
  });

  it("defines the touch classes under a hover none media query", () => {
    expect(globals).toContain("@media (hover: none)");
    const start = globals.indexOf("@media (hover: none)");
    const block = globals.slice(start, start + 400);
    expect(block).toContain(".touch-edit-hint");
    expect(block).toContain("display: inline");
    expect(block).toContain(".touch-edit-dash");
    expect(block).toContain("display: none");
  });

  it("still opens the editor on click, so the hint is a hint and not a button", () => {
    expect(sheet).toContain("onClick={col.editable ? () => startEdit(a, col.key) : undefined}");
  });
});

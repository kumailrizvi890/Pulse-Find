import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Two live-app gaps from the pass-1 audit, both in the tracker views.
//
// 1. Leads filter row: the search box lived inside the scrolling pills
// row, where `field`'s w-full stretched it to the full row width and
// pushed it off-screen right — invisible at desktop width and at 430px
// until the row was scrolled. The pills now scroll on their own row and
// the search sits outside it: its own full-width line on phones, a
// fixed 208px at the row's right end from sm up.
//
// 2. Sheet empty cells: every one of the 264 editable cells carried a
// title="Click to edit" tooltip, so the hint popped up everywhere, while
// the 59 empty cells showed nothing at all. Empty editable cells now
// show a faint dash, and the edit hint only while the cell is hovered.
// On touch screens the hint shows instead of the dash, since there is
// no hover there (hover none media query in globals.css).
// The Company column freeze was checked at the same time and already
// works (sticky left-0, verified live at desktop + 430px), so it is
// pinned here rather than changed.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const leads = read("components/pipeline/LeadsSection.tsx");
const sheet = read("components/dashboard/SheetView.tsx");

describe("leads filter row", () => {
  it("keeps the search box out of the scrolling pills row", () => {
    const pillsStart = leads.indexOf('overflow-x-auto px-1 pb-1');
    const pillsEnd = leads.indexOf("</div>", pillsStart);
    const pillsRow = leads.slice(pillsStart, pillsEnd);
    expect(pillsRow).not.toContain('aria-label="Search leads"');
    expect(pillsRow).toContain("All");
  });

  it("gives the search its own full-width line on phones and a fixed width from sm up", () => {
    expect(leads).toContain('className={cx(field, "w-full sm:w-52")}');
    expect(leads).not.toContain('"ml-auto w-52 shrink-0"');
  });

  it("lets the pills row shrink instead of pushing the page wide", () => {
    expect(leads).toContain("flex min-w-0 flex-1 gap-1.5 overflow-x-auto");
  });

  it("keeps every status pill and the search box itself", () => {
    expect(leads).toContain("{LEAD_STATUSES.map((s) => (");
    expect(leads).toContain('placeholder="Search leads"');
    expect(leads).toContain('aria-label="Search leads"');
  });
});

describe("sheet empty cells", () => {
  it("puts no 'Click to edit' tooltip on any cell", () => {
    expect(sheet).not.toContain('title={col.editable ? "Click to edit"');
    expect(sheet).not.toContain("Click to edit\" : undefined");
  });

  it("shows a faint dash in empty editable cells and the hint only on hover, or always on touch", () => {
    expect(sheet).toContain('const isEmptyEditable = !!col.editable && r.values[col.key] === "";');
    expect(sheet).toContain('className="text-faint group-hover:hidden touch-edit-dash">—</span>');
    expect(sheet).toContain('className="hidden text-faint group-hover:inline touch-edit-hint">Click to edit</span>');
  });

  it("marks editable cells as hover groups so the hint can appear", () => {
    expect(sheet).toContain('col.editable && "group"');
  });

  it("still renders values in non-empty cells and keeps click-to-edit working", () => {
    expect(sheet).toContain('onClick={col.editable ? () => startEdit(a, col.key) : undefined}');
    expect(sheet).toContain("<StatusPill status={a.status} />");
        // Values render through TruncatedCellText now: the full text as a
    // hover tooltip plus a Show more toggle for long values, instead of
    // the bare truncated span.
    expect(sheet).toContain("<TruncatedCellText");
    expect(sheet).toContain("value={r.values[col.key]}");
  });
});

describe("sheet frozen Company column (pinned, already working)", () => {
  it("keeps the Company header cell frozen at the left edge", () => {
    expect(sheet).toContain('ci === 0 && "left-0 z-20 border-r"');
  });

  it("keeps the Company body cells frozen at the left edge with an opaque background", () => {
    expect(sheet).toContain('ci === 0 && "sticky left-0 z-[5] border-r border-line sheet-sticky font-semibold"');
  });

  it("keeps Company the first column, so the frozen column is the Company column", () => {
    const sheetLib = read("lib/sheet.ts");
    expect(sheetLib).toMatch(/export const SHEET_COLUMNS: SheetColumn\[\] = \[\s*\{\s*key: "company"/);
  });
});

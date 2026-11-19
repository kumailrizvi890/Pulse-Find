import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoApplications } from "../demo-data";
import { todayISO } from "../metrics";
import {
  sheetColumnWidths,
  sheetRows,
  visibleSheetColumns,
  SHEET_COLUMNS,
  SHEET_COLUMN_WIDTH_PCT,
} from "../sheet";
import { emptyApplication, type Application } from "../types";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const sheet = read("components/dashboard/SheetView.tsx");
const globals = read("app/globals.css");

const TODAY = todayISO();

const app = (patch: Partial<Application>): Application => ({
  id: Math.random().toString(36).slice(2),
  ...emptyApplication("2026-10-01"),
  date_applied: "2026-10-01",
  last_contact: "2026-10-01",
  ...patch,
});

/**
 * Loop pass 48 — audit finding #7 (sheet page, desktop 1920px):
 * (1) the Email column was empty on all 22 demo rows and Notes on 20 of
 *     them, two dead columns of blank space;
 * (2) the table was ~1150px wide on a 1920px screen yet still scrolled
 *     horizontally (1180px page cap + content-sized columns);
 * (3) the sticky header bled row text through it (the glass .bg-surface
 *     is 86% translucent).
 */
describe("empty columns hide until they carry anything", () => {
  it("hides the demo Email column and keeps Notes (2 rows have notes)", () => {
    const rows = sheetRows(demoApplications(TODAY), TODAY, 21);
    expect(rows).toHaveLength(22);
    const visible = visibleSheetColumns(rows);
    expect(visible.map((c) => c.key)).not.toContain("email");
    expect(visible.map((c) => c.key)).toContain("notes");
    expect(visible).toHaveLength(15);
  });

  it("hides Notes too when no visible row has one", () => {
    const rows = sheetRows(
      [app({ company: "A Co", notes: "" }), app({ company: "B Co", notes: "" })],
      TODAY,
      21,
    );
    const keys = visibleSheetColumns(rows).map((c) => c.key);
    expect(keys).not.toContain("notes");
    expect(keys).not.toContain("email");
  });

  it("brings a column back the moment any visible row has a value", () => {
    const rows = sheetRows(
      [app({ company: "A Co", link: "", notes: "" }), app({ company: "B Co", link: "https://example.com/careers", notes: "Met at the fair" })],
      TODAY,
      21,
    );
    const keys = visibleSheetColumns(rows).map((c) => c.key);
    expect(keys).toContain("email");
    expect(keys).toContain("notes");
  });

  it("hides everything when there are no rows at all", () => {
    expect(visibleSheetColumns([])).toEqual([]);
  });
});

describe("fixed-layout column widths", () => {
  it("gives every column a positive width summing to 100", () => {
    for (const col of SHEET_COLUMNS) {
      expect(SHEET_COLUMN_WIDTH_PCT[col.key]).toBeGreaterThan(0);
    }
    const total = Object.values(SHEET_COLUMN_WIDTH_PCT).reduce((n, w) => n + w, 0);
    expect(total).toBe(100);
  });

  it("renormalizes the visible columns to exactly 100", () => {
    const rows = sheetRows(demoApplications(TODAY), TODAY, 21);
    const widths = sheetColumnWidths(visibleSheetColumns(rows));
    expect(widths).toHaveLength(15);
    const total = widths.reduce((n, w) => n + w.pct, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(widths.find((w) => w.key === "email")).toBeUndefined();
  });

  it("returns no widths for no columns", () => {
    expect(sheetColumnWidths([])).toEqual([]);
  });
});

describe("SheetView uses the full width with a fixed layout", () => {
  it("no longer caps the sheet page at 1180px", () => {
    expect(sheet).not.toContain("max-w-[1180px]");
  });

  it("renders a fixed-layout table with a colgroup from the visible columns", () => {
    expect(sheet).toContain("table-fixed");
    expect(sheet).toContain("<colgroup>");
    expect(sheet).toContain("sheetColumnWidths(visibleColumns)");
  });

  it("drives both the header and the body from the visible columns", () => {
    expect(sheet).toMatch(/\{visibleColumns\.map\(\(col, ci\) => \(\s*<th/);
    expect(sheet).toMatch(/\{visibleColumns\.map\(\(col, ci\) => \{/);
    expect(sheet).not.toContain("SHEET_COLUMNS.map((col, ci)");
  });

  it("offers the hidden columns back from the footer", () => {
    expect(sheet).toContain("empty column");
    expect(sheet).toContain("Show all");
    expect(sheet).toContain("Hide empty columns");
    expect(sheet).toContain("setShowEmpty");
  });
});

describe("sticky header and frozen column are solid, not glass", () => {
  it("gives the sticky header cells a solid surface class", () => {
    expect(sheet).toContain('"sheet-sticky sticky top-0 z-10 border-b border-line px-3 py-2.5');
    expect(sheet).not.toContain("sticky top-0 z-10 whitespace-nowrap");
    expect(sheet).not.toContain("bg-surface px-3 py-2.5");
  });

  it("gives the frozen Company cells the same solid surface", () => {
    expect(sheet).toContain('ci === 0 && "sticky left-0 z-[5] border-r border-line sheet-sticky font-semibold"');
  });

  it("defines .sheet-sticky as the solid surface color", () => {
    const block = globals.slice(globals.indexOf(".sheet-sticky"));
    expect(block).toContain("background-color: var(--surface);");
  });
});

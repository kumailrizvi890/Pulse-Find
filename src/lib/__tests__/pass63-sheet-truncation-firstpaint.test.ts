import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TruncatedCellText } from "../../components/dashboard/SheetView";

// Audit gap (pass 62): Role, Latest Update, Notes and Action Needed
// truncated with ellipses and the full text was unreachable without
// opening the editor. Truncated cells now carry the full text as a
// hover tooltip, and long values get a Show more toggle that expands
// the cell in place. The toggle stops the click, so it never starts
// editing.
const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const sheet = read("src/components/dashboard/SheetView.tsx");
const dashboard = read("src/components/dashboard/Dashboard.tsx");
const overview = read("src/components/dashboard/Overview.tsx");

const SHORT_VALUE = "Data Analyst Intern";
const LONG_VALUE = "Upload transcript and finish the portal application";

describe("sheet truncated cells show the full text", () => {
  it("renders a short value in full with a title tooltip and no toggle", () => {
    const html = renderToStaticMarkup(
      createElement(TruncatedCellText, { value: SHORT_VALUE, expanded: false, onToggle: () => {} }),
    );
    expect(html).toContain(SHORT_VALUE);
    expect(html).toContain(`title="${SHORT_VALUE}"`);
    expect(html).toContain("truncate");
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("<button");
  });

  it("truncates a long value and offers a Show more toggle", () => {
    const html = renderToStaticMarkup(
      createElement(TruncatedCellText, { value: LONG_VALUE, expanded: false, onToggle: () => {} }),
    );
    expect(html).toContain(LONG_VALUE);
    expect(html).toContain(`title="${LONG_VALUE}"`);
    expect(html).toContain("truncate");
    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="button"');
  });

  it("expanded shows Show less and wraps instead of truncating", () => {
    const html = renderToStaticMarkup(
      createElement(TruncatedCellText, { value: LONG_VALUE, expanded: true, onToggle: () => {} }),
    );
    expect(html).toContain("Show less");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("break-words");
    expect(html).not.toContain("truncate");
  });

  it("uses a 40 character limit, sized for the narrow sheet columns", () => {
    expect(sheet).toContain("const CELL_EXPAND_LIMIT = 40;");
    expect(sheet).toContain("value.length > CELL_EXPAND_LIMIT");
  });

  it("both truncated branches use the helper, with no bare truncated span left", () => {
    const uses = sheet.match(/<TruncatedCellText/g) ?? [];
    expect(uses.length).toBe(2);
    expect(sheet).not.toContain('<span className="block truncate">{r.values[col.key]}</span>');
    expect(sheet).not.toContain(
      '<span className={cx("block truncate", actionRow && "font-semibold text-danger")}>{r.values[col.key]}</span>',
    );
  });

  it("the toggle stops the click so it never starts editing", () => {
    const toggle = sheet.slice(sheet.indexOf("aria-expanded={expanded}"));
    expect(toggle).toContain("e.stopPropagation();");
    expect(toggle).toContain("onToggle();");
  });

  it("starting an edit collapses any expanded cell", () => {
    const starts = sheet.match(/setExpanded\(null\);/g) ?? [];
    expect(starts.length).toBe(1);
    const startEdit = sheet.slice(sheet.indexOf("function startEdit"), sheet.indexOf("async function commitEdit"));
    expect(startEdit).toContain("setExpanded(null);");
  });

  it("keeps the added copy free of em dashes", () => {
    const start = sheet.indexOf("// Sheet columns are 4-9%");
    const end = sheet.indexOf("export function SheetView");
    expect(sheet.slice(start, end)).not.toContain("—");
  });
});

describe("sheet text editor fits long values", () => {
  it("floats text editors wider than the narrow cell", () => {
    expect(sheet).toContain('style={col.editable === "text" ? { width: "min(360px, 72vw)" } : undefined}');
    expect(sheet).toContain('col.editable === "text" && "relative shadow-panel"');
  });

  it("leaves date and number editors at cell width", () => {
    const input = sheet.slice(sheet.indexOf('type={col.editable === "date"'));
    expect(input).toContain('col.editable === "text" ? { width: "min(360px, 72vw)" } : undefined');
    expect(input).not.toContain('col.editable === "date" ? { width:');
    expect(input).not.toContain('col.editable === "number" ? { width:');
  });
});

describe("first paint shows no zeros before the data loads", () => {
  it("sheet summary chips are skeleton pills while loading, not zeros", () => {
    expect(sheet).toContain('className="h-8 w-28 animate-pulse rounded-lg bg-surface-2"');
    const chips = sheet.slice(sheet.indexOf('data-tour="sheet-tools"'), sheet.indexOf('className="ml-auto"'));
    expect(chips).toContain('{state === "loading" ? (');
    expect(chips).toContain("<b>{sum.total}</b> applications");
  });

  it("sheet footer reads as loading while loading, not 0 of 0 rows", () => {
    expect(sheet).toContain('"Loading your sheet…"');
    const footer = sheet.slice(sheet.indexOf("border-t border-line px-4 py-2.5"));
    expect(footer).toContain('{state === "loading" ? (');
    expect(footer).toContain("Showing {rows.length} of {apps.length} rows");
  });

  it("dashboard filter chips show a skeleton tick while loading, not 0", () => {
    expect(dashboard).toContain('className="inline-block h-3 w-4 animate-pulse rounded bg-surface-2"');
    const chips = dashboard.slice(dashboard.indexOf("FILTERS.map((f)"));
    expect(chips).toContain("{loading ? (");
    expect(chips).toContain("{counts[f.id] ?? 0}");
  });

  it("dashboard status options show no count while loading, and keep the ready-state pins", () => {
    expect(dashboard).toContain("{loading ? s : `${s} (${statusCounts[s] ?? 0})`}");
    expect(dashboard).toContain("disabled={(statusCounts[s] ?? 0) === 0}");
    expect(dashboard).toContain("`${s} (${statusCounts[s] ?? 0})`");
  });
});

describe("stats row needs no first-paint fix", () => {
  it("the Overview stats render only after the loading early return", () => {
    const loadingReturn = overview.indexOf("if (loading) {");
    const stats = overview.indexOf('label="Total Applications"');
    expect(loadingReturn).toBeGreaterThan(-1);
    expect(stats).toBeGreaterThan(loadingReturn);
  });

  it("the loading branch is skeletons, not numbers", () => {
    const branch = overview.slice(overview.indexOf("if (loading) {"), overview.indexOf('return (\n    <div className="space-y-4" data-tour="dashboard">'));
    expect(branch).toContain("animate-pulse");
    expect(branch).not.toContain("OverviewStat");
  });
});

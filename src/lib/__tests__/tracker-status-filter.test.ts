import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The tracker page (dashboard) had no way to filter by a single status:
// the status dropdown lived on the Sheet only, and the dashboard search
// matched company + role and nothing else. So "rejected" or "OA
// Received" typed in the search box found nothing, and picking a stage
// meant leaving the tracker page. This pins the tracker-page filter,
// the red active-filter tag on both pages, and the smarter search.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const dashboard = read("components/dashboard/Dashboard.tsx");
const sheetView = read("components/dashboard/SheetView.tsx");
const metrics = read("lib/metrics.ts");

describe("tracker status filter", () => {
  it("adds a Filter by status dropdown to the tracker table toolbar", () => {
    expect(dashboard).toContain('aria-label="Filter by status"');
    expect(dashboard).toContain("All statuses");
    expect(dashboard).toContain("STATUSES.map((s)");
    expect(dashboard).toContain("{s} ({statusCounts[s] ?? 0})");
  });

  it("passes the selected status into applyFilter alongside the chip filter and search", () => {
    expect(dashboard).toContain("useState<Status | \"All\">(\"All\")");
    expect(dashboard).toContain("applyFilter(apps, filter, today, settings.ghost_days, query, status)");
    expect(metrics).toContain('status: Status | "All" = "All"');
  });

  it("shows a red tag with the active status and a way to clear it", () => {
    expect(dashboard).toContain("Clear status filter ${status}");
    expect(dashboard).toContain("Status: {status} · {statusCounts[status] ?? 0}");
    expect(dashboard).toContain("border-danger/40 bg-danger-soft");
    expect(dashboard).toContain('setStatus("All")');
  });

  it("offers Clear filters in the zero-result state and resets everything at once", () => {
    expect(dashboard).toContain("No applications match this filter.");
    expect(dashboard).toContain("Clear filters");
    const start = dashboard.indexOf("Clear filters");
    const button = dashboard.slice(dashboard.lastIndexOf("<button", start), start);
    expect(button).toContain('setQuery("")');
    expect(button).toContain('setStatus("All")');
    expect(button).toContain('setFilter("all")');
  });

  it("does not let a status filter hide the waiting list", () => {
    const start = dashboard.indexOf("const showWaiting");
    const body = dashboard.slice(start, start + 400);
    expect(body).toContain('setStatus("All")');
  });

  it("searches company, role, status and notes, not just company and role", () => {
    expect(dashboard).toContain('placeholder="Search anything"');
    expect(metrics).toContain("applicationSearchText");
    expect(metrics).toContain("a.track");
    expect(metrics).toContain("a.status");
    expect(metrics).toContain("a.notes");
  });
});

describe("sheet red tag", () => {
  it("shows the same red tag when the sheet status filter is active", () => {
    expect(sheetView).toContain("Clear status filter ${status}");
    expect(sheetView).toContain("Status: {status}");
    expect(sheetView).toContain("border-danger/40 bg-danger-soft");
  });
});

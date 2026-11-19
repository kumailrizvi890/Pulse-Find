import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sheetRows } from "../sheet";
import { emptyApplication, type Application } from "../types";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const TODAY = "2026-11-11";
const GHOST = 21;

const app = (patch: Partial<Application>): Application => ({
  id: Math.random().toString(36).slice(2),
  ...emptyApplication("2026-10-01"),
  date_applied: "2026-10-01",
  last_contact: "2026-10-01",
  ...patch,
});

describe("sheet waiting flag reads as awaiting a reply", () => {
  it("labels a quiet non-closed application 'Awaiting reply'", () => {
    const rows = sheetRows(
      [app({ company: "Quiet Co", role: "Software Engineer Intern", last_contact: "2026-11-05" })],
      TODAY,
      GHOST,
    );
    expect(rows[0].flag).toBe("waiting");
    expect(rows[0].flagLabel).toBe("Awaiting reply");
    expect(rows[0].values.flag).toBe("Awaiting reply");
  });

  it("uses the same label in the sheet and the xlsx export", () => {
    const sheet = read("src/lib/sheet.ts");
    const exp = read("src/lib/export.ts");
    expect(sheet).toContain('waiting: "Awaiting reply"');
    expect(exp).toContain('waiting: "Awaiting reply"');
  });

  it("has no bare 'Waiting' flag label left in the sheet or export code", () => {
    for (const p of ["src/lib/sheet.ts", "src/lib/export.ts"]) {
      const src = read(p);
      // The only "Waiting" strings allowed are the new label itself and
      // the unrelated "Waiting on you" panel copy, which lives elsewhere.
      const bare = src.match(/"Waiting"/g) ?? [];
      expect(bare).toHaveLength(0);
    }
  });

  it("the xlsx import fixture uses the new label", () => {
    expect(read("src/lib/__tests__/xlsx.test.ts")).toContain('"Awaiting reply"');
  });

  it("does not rename the 'Waiting on you' panel anywhere", () => {
    expect(read("src/components/dashboard/SheetView.tsx")).toContain("Waiting on you");
  });
});

describe("sheet cell edit hint", () => {
  it("shows a save and cancel hint while a cell is being edited", () => {
    const sheet = read("src/components/dashboard/SheetView.tsx");
    expect(sheet).toContain("Enter to save");
    expect(sheet).toContain("Esc to cancel");
    // The hint sits inside the editing cell, under the editor.
    const editing = sheet.slice(sheet.indexOf("if (isEditing)"));
    expect(editing).toContain("Enter to save · Esc to cancel");
  });

  it("lets Enter commit from the select editors too, not just text inputs", () => {
    const sheet = read("src/components/dashboard/SheetView.tsx");
    const selects = sheet.match(/HTMLSelectElement\)\.blur\(\)/g) ?? [];
    expect(selects.length).toBe(2);
  });
});

describe("networking due-only filter", () => {
  it("has a Due only toggle chip beside the search box", () => {
    const net = read("src/components/pipeline/NetworkingSection.tsx");
    expect(net).toContain("Due only");
    expect(net).toContain("aria-pressed={dueOnly}");
    expect(net).toContain("onClick={() => setDueOnly((v) => !v)}");
  });

  it("filters to overdue and due-today contacts using the shared dueBucket", () => {
    const net = read("src/components/pipeline/NetworkingSection.tsx");
    expect(net).toContain('bucket !== "overdue" && bucket !== "today"');
    expect(net).toContain("dueBucket(c, today)");
    // A due date with no written step still counts as due: the render
    // already falls back to "Follow up", and the filter's due branch
    // checks only the bucket, never the step text.
    const rows = net.slice(net.indexOf("const rows = useMemo"));
    expect(rows).toContain(
      'if (dueOnly) {\n        const bucket = dueBucket(c, today);\n        if (bucket !== "overdue" && bucket !== "today") return false;\n      }',
    );
  });

  it("composes the chip with the existing search", () => {
    const net = read("src/components/pipeline/NetworkingSection.tsx");
    const rows = net.slice(net.indexOf("const rows = useMemo"), net.indexOf("async function markDone"));
    expect(rows).toContain("dueOnly");
    expect(rows).toContain("query.trim().toLowerCase()");
  });

  it("says something specific when the due-only filter matches nobody", () => {
    const net = read("src/components/pipeline/NetworkingSection.tsx");
    expect(net).toContain("No follow-ups due right now.");
    expect(net).toContain("No due follow-ups match this search.");
  });
});

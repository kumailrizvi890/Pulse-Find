import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Three small gaps from the pass-35 desktop audit (Nov 17, 10:48-11:43pm PT):
// (1) /demo/jobs was a bare 404 - the route never existed, reachable only
// by typing the URL. The jobs board is public, so the demo route redirects
// there instead of stranding the visitor.
// (2) The Sheet subtitle said edits "save right away" even in the demo,
// where the banner says nothing is saved - a direct contradiction.
// (3) The dashboard Networking Follow-ups panel showed next step, name and
// due date but never the contact's note, so useful context stayed hidden
// until the Networking page. The note now shows as one truncated line.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

describe("demo jobs redirect", () => {
  it("sends /demo/jobs to the public jobs board", () => {
    const page = read("app/demo/jobs/page.tsx");
    expect(page).toContain('redirect("/jobs")');
    expect(page).not.toContain("getUser");
    expect(page).not.toContain("supabase");
  });
});

describe("sheet subtitle in demo mode", () => {
  it("splits the save wording on the store kind", () => {
    const sheet = read("components/dashboard/SheetView.tsx");
    expect(sheet).toContain('store.kind === "demo"');
    expect(sheet).toContain("nothing is saved in the demo");
    expect(sheet).toContain("it saves right away");
  });
});

describe("networking follow-ups notes", () => {
  it("shows each contact note on the dashboard panel", () => {
    const overview = read("components/dashboard/Overview.tsx");
    expect(overview).toContain("{c.notes &&");
  });
});

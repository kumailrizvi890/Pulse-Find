import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The MCP edge function runs with the service role, so row-level
// security does not apply there: every query on a per-user table must
// be scoped to the token's user by hand. This test reads the function
// source and fails if any such query is missing its user filter, so a
// new tool or query cannot quietly leak one user's rows to another.
//
// Intentional exceptions, allowlisted here with the reason:
//   - "jobs": the public job board; anyone may read it, there is no
//     user_id column at all.
//   - "api_tokens": the token-hash lookup that identifies the caller
//     in the first place (before any user id is known), plus the
//     last_used_at touch on that same token row, scoped by its id.
const root = join(__dirname, "..", "..", "..");
const source = readFileSync(join(root, "supabase", "functions", "mcp", "index.ts"), "utf8");

const ALLOWLISTED = new Set(["jobs", "api_tokens"]);

function scoped(snippet: string): boolean {
  return snippet.includes('.eq("user_id", uid)') || snippet.includes("user_id: uid");
}

describe("MCP edge function user scoping", () => {
  it("scopes every per-user table query to the token's user", () => {
    const matches = [...source.matchAll(/\.from\("([a-z_]+)"\)/g)];
    expect(matches.length).toBeGreaterThan(0);
    const tables = new Set<string>();
    for (const m of matches) {
      const table = m[1];
      tables.add(table);
      if (ALLOWLISTED.has(table)) continue;
      // The query chain that follows this .from( call, up to the next
      // query, is where its user filter must live.
      const start = (m.index ?? 0) + m[0].length;
      const next = source.indexOf('.from("', start);
      const snippet = source.slice(start, next === -1 ? start + 800 : Math.min(next, start + 800));
      expect(scoped(snippet), `unscoped query on "${table}": ${snippet.trim().slice(0, 160)}`).toBe(true);
    }
    // Guard against the test going vacuous if the queries move elsewhere.
    for (const table of ["applications", "events", "job_leads", "networking_contacts", "profiles"]) {
      expect(tables.has(table), `expected a query on "${table}" in the MCP function`).toBe(true);
    }
  });
});

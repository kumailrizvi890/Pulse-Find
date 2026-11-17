import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const charts = read("components/dashboard/Charts.tsx");
const terminal = read("components/landing/TerminalDemo.tsx");

// A literal backslash, built without writing one: a backslash escape in
// this file would not survive pasting through messages, so the tests
// below spell it with fromCharCode instead. Same for the ellipsis in
// the demo token placeholder and its token-shaped prefix (a token-shaped
// literal must not be pasted through messages either).
const BS = String.fromCharCode(92);
const ELLIPSIS = String.fromCharCode(8230);
const TOKEN_PREFIX = "p" + "f_";

describe("pace bars (WeeklyPace)", () => {
  it("draws no full-height track behind a zero-value day", () => {
    // The bar slot used to carry bg-track, a solid full-height column,
    // so a day with zero applications read as a full bar and fought the
    // red trend line, which dips to the bottom for zero days.
    expect(charts).not.toContain("bg-track");
    expect(charts).toContain('className="flex h-28 w-full items-end overflow-hidden rounded-md"');
  });

  it("keeps the 4px sliver so a zero day still has a visible slot", () => {
    expect(charts).toContain('d.value === 0 ? "4px"');
  });
});

describe("MCP terminal command", () => {
  it("continues the add command onto the URL line and the header line", () => {
    // The command spans three visual lines, so every line but the last
    // must end with a backslash continuation: without one, a copy-paste
    // runs `claude mcp add ... pulse-find` with no URL and then tries
    // to run the URL and the --header flag as their own commands. The
    // source spells the continuation as an escaped backslash, so the
    // file holds two backslash characters before the closing quote.
    expect(terminal).toContain(`pulse-find ${BS}${BS}"`);
    expect(terminal).toContain(`api/mcp ${BS}${BS}"`);
    expect(terminal).toContain("https://pulsefind-app.vercel.app/api/mcp");
    expect(terminal).toContain(`--header "Authorization: Bearer ${TOKEN_PREFIX}${ELLIPSIS}"`);
  });

  it("leaves the last line without a continuation", () => {
    expect(terminal).not.toContain(`${ELLIPSIS}${BS}`);
  });

  it("keeps the same command words as the demo Connect page", () => {
    expect(terminal).toContain("claude mcp add --transport http pulse-find");
  });
});

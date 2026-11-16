import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Button glyphs as inline SVG (Nov 16, 2026).
//
// The swipe-deck Pass / Undo / Save buttons, the saved-list remove button
// and the landing terminal Replay button rendered as bare Unicode glyphs:
// ✕ (U+2715), ↺ (U+21BA) and ✓ (U+2713). Those live in the Dingbats /
// Arrows blocks, which Geist does not cover, so they only appeared via a
// system fallback font — and on minimal font setups (the cloud browser
// among them) they showed up missing entirely. The fix swaps each glyph
// for a stroke icon from src/components/icons.tsx, drawn in currentColor
// so the buttons keep their existing colours and sizes.
//
// Scope note: ✓ also appears as body text elsewhere (login success line,
// setup-wizard step marker, Bento card, terminal transcript). Those
// rendered fine in the same browser that lost ✕/↺, and they are text,
// not buttons — they are deliberately left alone. Only the button glyphs
// move to SVG, plus the Save ✓ so the three deck buttons match.
const deck = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "SwipeDeck.tsx"),
  "utf8",
);
const board = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "JobsBoard.tsx"),
  "utf8",
);
const terminal = readFileSync(
  join(__dirname, "..", "..", "components", "landing", "TerminalDemo.tsx"),
  "utf8",
);
const icons = readFileSync(
  join(__dirname, "..", "..", "components", "icons.tsx"),
  "utf8",
);

describe("no font-dependent glyphs left in the buttons", () => {
  it("has no ✕ / ↺ / ✓ literal in the swipe deck", () => {
    expect(deck).not.toContain("✕");
    expect(deck).not.toContain("↺");
    expect(deck).not.toContain("✓");
  });

  it("has no ✕ literal in the jobs board", () => {
    expect(board).not.toContain("✕");
  });

  it("has no ↺ literal in the terminal Replay button", () => {
    // The transcript lines still use ✓ as typed text — only the button
    // moves to SVG, so pin the button itself, not the whole file.
    const button = terminal.slice(terminal.indexOf("Replay the terminal demo"));
    expect(button).not.toContain("↺");
    expect(button).toContain("Replay");
  });
});

describe("the shared icons", () => {
  it("exports X, check and undo", () => {
    expect(icons).toContain("export function IconX");
    expect(icons).toContain("export function IconCheck");
    expect(icons).toContain("export function IconUndo");
  });

  it("draws in currentColor with no fill, so buttons keep their colours", () => {
    expect(icons).toContain('stroke="currentColor"');
    expect(icons).toContain('fill="none"');
  });

  it("hides the SVGs from assistive tech — the buttons carry the labels", () => {
    expect(icons).toContain('aria-hidden="true"');
  });

  it("is a plain component file, importable from server components too", () => {
    expect(icons).not.toContain('"use client"');
  });
});

describe("the buttons use the icons", () => {
  it("deck Pass / Undo / Save render the three icons at the old glyph sizes", () => {
    expect(deck).toContain('<IconX className="h-5 w-5" />');
    expect(deck).toContain('<IconUndo className="h-[18px] w-[18px]" />');
    expect(deck).toContain('<IconCheck className="h-5 w-5" />');
  });

  it("deck buttons keep their accessible labels", () => {
    expect(deck).toContain('aria-label="Pass"');
    expect(deck).toContain('aria-label="Undo"');
    expect(deck).toContain('aria-label="Save"');
  });

  it("saved-list remove renders the X icon and keeps its label", () => {
    expect(board).toContain('<IconX className="h-3.5 w-3.5" />');
    expect(board).toContain("aria-label={`Remove ${j.title}`}");
  });

  it("terminal Replay renders the undo icon beside the word", () => {
    expect(terminal).toContain('<IconUndo className="h-3 w-3" /> Replay');
    expect(terminal).toContain('aria-label="Replay the terminal demo"');
  });

  it("all three files import from the shared icons module", () => {
    expect(deck).toContain('from "@/components/icons"');
    expect(board).toContain('from "@/components/icons"');
    expect(terminal).toContain('from "@/components/icons"');
  });
});

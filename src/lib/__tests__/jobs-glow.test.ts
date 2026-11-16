import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The "Waiting on you" panel glows when there is something waiting: a red
// halo (border-danger/30 pf-glow), a pulsing dot beside the live count,
// and a glowing count badge. The Jobs swipe section had none of that —
// the deck and the saved list looked like a different, flatter surface.
// Carry the same three pieces over, reusing the exact same classes and
// components, so the two sections read as one design. Glow only, no
// layout, copy or behavior change.
const deck = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "SwipeDeck.tsx"),
  "utf8",
);
const board = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "JobsBoard.tsx"),
  "utf8",
);
const overview = readFileSync(
  join(__dirname, "..", "..", "components", "dashboard", "Overview.tsx"),
  "utf8",
);

describe("jobs deck halo", () => {
  it("uses the exact same halo as the Waiting on you panel", () => {
    // The reference, in Overview: the panel glows only while something
    // is waiting. The deck must spell it the same way, not a lookalike.
    expect(overview).toContain('queue.length ? "border-danger/30 pf-glow"');
    expect(deck).toContain('top ? "border-danger/30 pf-glow"');
  });

  it("puts the halo on a wrapper outside the swipe container, not on the card", () => {
    // The deck container is overflow-hidden (the swipe fly-off needs the
    // clipping), and overflow-hidden clips a box-shadow — a pf-glow on
    // the card itself would be invisible. The wrapper is exactly the
    // card's size, so the halo still hugs the active card.
    expect(deck).toContain("overflow-hidden");
    const article = deck.slice(deck.indexOf("<article"), deck.indexOf("</article>"));
    expect(article).not.toContain("pf-glow");
    expect(deck.indexOf("pf-glow")).toBeLessThan(deck.indexOf("relative h-[400px]"));
    // The wrapper carries the same rounded corners as the card, so the
    // ring follows the card's shape. (The first pf-glow hit in the file
    // is the comment above the wrapper, so anchor on the code line.)
    expect(deck).toContain('cx("w-full rounded-3xl border border-transparent", top ? "border-danger/30 pf-glow" : undefined)');
  });

  it("shows the halo only while there is a top card, like the panel only glows while something waits", () => {
    expect(deck).toMatch(/top \? "border-danger\/30 pf-glow" : undefined/);
  });

  it("keeps the deck the same size whether it glows or not", () => {
    // The wrapper border is always present (transparent when empty), so
    // the deck never shifts size between the glowing and empty states.
    expect(deck).toContain('cx("w-full rounded-3xl border border-transparent"');
  });
});

describe("jobs deck header dot", () => {
  it("uses the same pulsing dot component as the Waiting on you header", () => {
    expect(overview).toContain('from "@/components/PulseBrand"');
    expect(overview).toContain("<PulseDot />");
    expect(board).toContain('import { PulseDot } from "@/components/PulseBrand";');
    expect(board).toContain("<PulseDot />");
  });

  it("shows the dot only while there are jobs left to review", () => {
    const start = board.indexOf('className="mb-3 flex');
    const end = board.indexOf("left to review", start);
    const header = board.slice(start, end);
    expect(header).toContain("{queue.length ? <PulseDot /> : null}");
  });
});

describe("jobs saved count badge", () => {
  it("wears the same glowing badge as the notification counts", () => {
    expect(board).toContain('<span className="pf-badge">{savedList.length} saved</span>');
  });

  it("no longer renders the saved count as a flat muted tag", () => {
    expect(board).not.toContain('<Tag tone="muted">{savedList.length}</Tag>');
  });
});

describe("jobs glow reuses the system, nothing new", () => {
  it("adds no new colors and no new glow styles to the Jobs files", () => {
    for (const src of [deck, board]) {
      expect(src).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(src).not.toContain("box-shadow:");
      expect(src).not.toContain("@keyframes");
    }
  });

  it("does not touch the swipe behavior or the toasts", () => {
    expect(deck).toContain("const THRESHOLD = 110;");
    expect(deck).toContain('onDecide(top, choice)');
    expect(board).toContain('toast(choice === "saved" ? "Saved" : "Hidden")');
  });
});

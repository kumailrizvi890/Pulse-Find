import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_REPLY,
  AGENT_REPLY_WORDS,
  DEMO_COMPANIES,
  GRAPH_LOOP_MS,
  GRAPH_NODE_COUNT,
  HOW_IT_WORKS_STEP_COUNT,
  HOW_IT_WORKS_STEPS,
  MATCH_RING_LOOP_MS,
  MATCH_SCORE,
  STAGE_FILL_LOOP_MS,
  STAGE_COLORS,
  SWIPE_LOOP_MS,
  TYPING_LOOP_MS,
  graphDrawProgress,
  matchRingFrame,
  pulseDotPosition,
  sectionProgress,
  stageFillProgress,
  swipeCardFrame,
  typingProgress,
  wrapTime,
} from "@/lib/how-it-works";

// How it works (landing only, Nov 20 2026): five teaching steps
// between the hero and About, each a slice of the real product UI
// with a cute animated mini-demo. Copy is minimal and factual,
// built only from words already on the page. Demo data only.

const root = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const home = read("app/page.tsx");
const component = read("components/landing/HowItWorks.tsx");
const lib = read("lib/how-it-works.ts");

const BANNED = ["supercharge", "seamless", "elevate", "unlock", "all-in-one", "All-in-one"];

describe("how it works steps", () => {
  it("has five steps in order, with the locked minimal copy", () => {
    expect(HOW_IT_WORKS_STEPS).toHaveLength(5);
    expect(HOW_IT_WORKS_STEP_COUNT).toBe(5);
    expect(HOW_IT_WORKS_STEPS.map((s) => s.title)).toEqual([
      "Find roles matched to you",
      "Swipe to save",
      "Track every application by stage",
      "Line up the right people",
      "Let your agent do the busywork",
    ]);
    expect(HOW_IT_WORKS_STEPS[0].body).toBe("Fresh postings that fit your level, newest first.");
    expect(HOW_IT_WORKS_STEPS[1].body).toBe(
      "Swipe to save and they land straight in your Leads, ready to apply.",
    );
    expect(HOW_IT_WORKS_STEPS[3].body).toBe("The recruiters and alumni behind each posting.");
    expect(HOW_IT_WORKS_STEPS[4].body).toContain("through MCP");
    for (const s of HOW_IT_WORKS_STEPS) {
      expect(s.num).toMatch(/^0[1-5]$/);
      expect(s.title).not.toContain("—");
      expect(s.body).not.toContain("—");
    }
  });

  it("uses no fluff words and no em dashes in the step copy or the lib", () => {
    for (const s of HOW_IT_WORKS_STEPS) {
      for (const word of BANNED) {
        expect(s.title.toLowerCase()).not.toContain(word);
        expect(s.body.toLowerCase()).not.toContain(word);
      }
    }
    expect(lib).not.toContain("—");
    for (const word of BANNED) {
      expect(lib.toLowerCase()).not.toContain(word);
    }
  });

  it("uses fictional demo companies only, with the real stage colors", () => {
    expect(DEMO_COMPANIES).toEqual([
      "Northwind",
      "Copperline",
      "Atlas",
      "Fernhill",
      "Saltmarsh",
      "Verdant",
      "Tidewater",
      "Kestrel",
      "Oakline",
    ]);
    expect(STAGE_COLORS.Applied).toBe("#fd585d");
    expect(STAGE_COLORS.OA).toBe("#e8a83c");
    expect(STAGE_COLORS.Interview).toBe("#5eac6d");
    expect(component).toContain("Northwind");
    expect(component).toContain("Copperline");
    expect(component).toContain("Fernhill");
    expect(component).not.toContain("284");
  });

  it("wraps loop time, clamping the loop edge", () => {
    expect(wrapTime(0, 1000)).toBe(0);
    expect(wrapTime(1000, 1000)).toBe(0);
    expect(wrapTime(1500, 1000)).toBe(500);
    expect(wrapTime(-100, 1000)).toBe(900);
    expect(wrapTime(100, 0)).toBe(0);
  });
});

describe("match ring", () => {
  it("starts at 0, draws to 92, and wraps cleanly", () => {
    expect(matchRingFrame(0)).toEqual({ progress: 0, score: 0 });
    expect(matchRingFrame(MATCH_RING_LOOP_MS)).toEqual({ progress: 0, score: 0 });
    expect(matchRingFrame(MATCH_RING_LOOP_MS + 900)).toEqual(matchRingFrame(900));
    const mid = matchRingFrame(MATCH_RING_LOOP_MS / 2);
    expect(mid.progress).toBeGreaterThan(0.8);
    expect(mid.progress).toBeLessThan(1);
    expect(mid.score).toBe(Math.round(MATCH_SCORE * mid.progress));
    const end = matchRingFrame(MATCH_RING_LOOP_MS - 1);
    expect(end.progress).toBeGreaterThan(0.99);
    expect(end.score).toBe(MATCH_SCORE);
  });
});

describe("swipe deck", () => {
  it("holds, swipes off right with rotation, then springs in", () => {
    const hold = swipeCardFrame(0);
    expect(hold).toEqual({
      translateX: 0,
      rotateDeg: 0,
      opacity: 1,
      scale: 1,
      phase: "hold",
      savedOpacity: 0,
    });
    const mid = swipeCardFrame(SWIPE_LOOP_MS * 0.55);
    expect(mid.phase).toBe("swiping");
    expect(mid.translateX).toBeGreaterThan(100);
    expect(mid.rotateDeg).toBeGreaterThan(5);
    expect(mid.savedOpacity).toBeGreaterThan(0);
    const entering = swipeCardFrame(SWIPE_LOOP_MS * 0.75);
    expect(entering.phase).toBe("entering");
    expect(entering.translateX).toBeLessThan(0);
    expect(entering.translateX).toBeGreaterThan(-48);
    expect(entering.opacity).toBeGreaterThan(0.6);
    expect(entering.opacity).toBeLessThanOrEqual(1);
  });

  it("wraps the loop and settles back to hold at the end", () => {
    expect(swipeCardFrame(SWIPE_LOOP_MS)).toEqual(swipeCardFrame(0));
    expect(swipeCardFrame(SWIPE_LOOP_MS + 100)).toEqual(swipeCardFrame(100));
    expect(swipeCardFrame(SWIPE_LOOP_MS - 1).phase).toBe("hold");
    expect(swipeCardFrame(SWIPE_LOOP_MS - 1).translateX).toBe(0);
  });
});

describe("stage fill", () => {
  it("starts empty and ends with every stage full", () => {
    const start = stageFillProgress(0);
    expect(start).toEqual({ applied: 0, oa: 0, interview: 0, activeIndex: 0, done: false });
    const end = stageFillProgress(STAGE_FILL_LOOP_MS - 1);
    expect(end.applied).toBe(1);
    expect(end.oa).toBe(1);
    expect(end.interview).toBe(1);
    expect(end.activeIndex).toBe(3);
    expect(end.done).toBe(true);
  });

  it("fills strictly in order, one stage at a time", () => {
    const duringApplied = stageFillProgress(700);
    expect(duringApplied.applied).toBeGreaterThan(0);
    expect(duringApplied.applied).toBeLessThan(1);
    expect(duringApplied.oa).toBe(0);
    expect(duringApplied.interview).toBe(0);
    expect(duringApplied.activeIndex).toBe(0);
    const duringOa = stageFillProgress(2500);
    expect(duringOa.applied).toBe(1);
    expect(duringOa.oa).toBeGreaterThan(0);
    expect(duringOa.oa).toBeLessThan(1);
    expect(duringOa.interview).toBe(0);
    expect(duringOa.activeIndex).toBe(1);
    const duringInterview = stageFillProgress(4300);
    expect(duringInterview.applied).toBe(1);
    expect(duringInterview.oa).toBe(1);
    expect(duringInterview.interview).toBeGreaterThan(0);
    expect(duringInterview.activeIndex).toBe(2);
  });

  it("wraps the loop", () => {
    expect(stageFillProgress(STAGE_FILL_LOOP_MS)).toEqual(stageFillProgress(0));
    expect(stageFillProgress(STAGE_FILL_LOOP_MS + 700)).toEqual(stageFillProgress(700));
  });
});

describe("network graph", () => {
  it("starts undrawn with only the first node lit", () => {
    const start = graphDrawProgress(0);
    expect(start.edges).toEqual([0, 0, 0]);
    expect(start.nodes).toEqual([true, false, false, false]);
    expect(start.edges).toHaveLength(GRAPH_NODE_COUNT - 1);
  });

  it("draws edges in order and lights nodes as lines reach them", () => {
    const mid = graphDrawProgress(2000);
    expect(mid.edges[0]).toBe(1);
    expect(mid.edges[1]).toBeGreaterThan(0);
    expect(mid.edges[1]).toBeLessThan(1);
    expect(mid.edges[2]).toBe(0);
    expect(mid.nodes).toEqual([true, true, false, false]);
    const end = graphDrawProgress(GRAPH_LOOP_MS - 1);
    expect(end.edges).toEqual([1, 1, 1]);
    expect(end.nodes).toEqual([true, true, true, true]);
  });

  it("wraps the loop", () => {
    expect(graphDrawProgress(GRAPH_LOOP_MS)).toEqual(graphDrawProgress(0));
    expect(graphDrawProgress(GRAPH_LOOP_MS + 2000)).toEqual(graphDrawProgress(2000));
  });
});

describe("agent typing", () => {
  it("shows dots first, then words one at a time, then holds done", () => {
    const dots = typingProgress(0);
    expect(dots).toEqual({ dotsVisible: true, wordsShown: 0, phase: "typing", done: false });
    const first = typingProgress(1400 + 320);
    expect(first.dotsVisible).toBe(false);
    expect(first.wordsShown).toBe(1);
    expect(first.phase).toBe("replying");
    const done = typingProgress(1400 + 320 * AGENT_REPLY_WORDS.length);
    expect(done.wordsShown).toBe(AGENT_REPLY_WORDS.length);
    expect(done.phase).toBe("done");
    expect(done.done).toBe(true);
    const held = typingProgress(TYPING_LOOP_MS - 1);
    expect(held.done).toBe(true);
    expect(held.wordsShown).toBe(AGENT_REPLY_WORDS.length);
  });

  it("types the full reply and wraps the loop", () => {
    expect(AGENT_REPLY_WORDS.join(" ")).toBe(AGENT_REPLY);
    expect(AGENT_REPLY).toContain("Fernhill");
    expect(AGENT_REPLY).toContain("Applied");
    expect(typingProgress(TYPING_LOOP_MS)).toEqual(typingProgress(0));
  });
});

describe("section progress and pulse dot", () => {
  it("is 0 before the section arrives and 1 after it leaves", () => {
    expect(sectionProgress(-800, 1000, 1000, 800)).toBe(0);
    expect(sectionProgress(200, 1000, 1000, 800)).toBe(0);
    expect(sectionProgress(2000, 1000, 1000, 800)).toBe(1);
    expect(sectionProgress(1100, 1000, 1000, 800)).toBeCloseTo(0.5, 5);
    expect(sectionProgress(0, 0, 0, 800)).toBe(0);
    expect(sectionProgress(0, 0, 1000, 0)).toBe(0);
  });

  it("rides the rail step by step, clamped at both ends", () => {
    expect(pulseDotPosition(0)).toEqual({ stepIndex: 0, stepProgress: 0, railProgress: 0 });
    expect(pulseDotPosition(1)).toEqual({ stepIndex: 4, stepProgress: 1, railProgress: 1 });
    expect(pulseDotPosition(-0.5)).toEqual({ stepIndex: 0, stepProgress: 0, railProgress: 0 });
    expect(pulseDotPosition(1.5)).toEqual({ stepIndex: 4, stepProgress: 1, railProgress: 1 });
    const mid = pulseDotPosition(0.5);
    expect(mid.stepIndex).toBe(2);
    expect(mid.stepProgress).toBeCloseTo(0, 5);
    expect(mid.railProgress).toBe(0.5);
    const between = pulseDotPosition(0.375);
    expect(between.stepIndex).toBe(1);
    expect(between.stepProgress).toBeCloseTo(0.5, 5);
  });

  it("handles a single step without dividing by zero", () => {
    expect(pulseDotPosition(0.5, 1)).toEqual({ stepIndex: 0, stepProgress: 1, railProgress: 0.5 });
    expect(pulseDotPosition(0, 1).stepIndex).toBe(0);
  });
});

describe("how it works component", () => {
  it("uses the reveal pattern, device tiers, and the ECG rail", () => {
    expect(component).toContain("reveal-3d");
    expect(component).toContain("IntersectionObserver");
    expect(component).toContain("deviceTier");
    expect(component).toContain("from \"@/lib/hero-crazy\"");
    expect(component).toContain("requestAnimationFrame");
    expect(component).toContain("prefers-reduced-motion");
    expect(component).toContain("hiw-rail-dot");
    expect(component).toContain("hiw-rail-draw");
    expect(component).toContain("pulseDotPosition");
    expect(component).toContain("sectionProgress");
  });

  it("renders real product UI for every demo, with sample labels", () => {
    for (const name of [
      "hiw-match-card",
      "hiw-swipe-deck",
      "hiw-tracker-row",
      "hiw-network",
      "hiw-agent",
      "Saved to Leads",
      "Sample data",
    ]) {
      expect(component).toContain(name);
    }
    expect(component).toContain("How it works");
    expect(component).toContain("Clash Display");
  });

  it("shows lite tier demos at their end states with no loop", () => {
    expect(component).toContain("hiw-static");
    expect(component).toContain("\"lite\"");
    expect(component).toContain("cancelAnimationFrame");
  });

  it("has no em dashes and no fluff words in the component copy", () => {
    expect(component).not.toContain("—");
    for (const word of BANNED) {
      expect(component.toLowerCase()).not.toContain(word);
    }
  });

  it("sits immediately after the hero in page.tsx and changes nothing else", () => {
    expect(home).toContain("<HowItWorks />");
    expect(home).toContain("from \"@/components/landing/HowItWorks\"");
    expect(home.indexOf("<HeroCrazy />")).toBeLessThan(home.indexOf("<HowItWorks />"));
    expect(home.indexOf("<HowItWorks />")).toBeLessThan(home.indexOf("<InstallSection />"));
  });
});

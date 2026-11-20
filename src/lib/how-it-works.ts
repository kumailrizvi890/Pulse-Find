// How it works (landing only, Nov 20 2026): the teaching section
// between the hero and About. Every moving part is a pure function
// of time or scroll, so the timing is unit-testable without a DOM
// and the component is just the loop that reads it.
//
// The demos are slices of the real product UI, not illustrations:
// a role card with a match ring, the swipe deck, a tracker row
// filling stage by stage, a network panel, and the agent chat.
// All companies and roles are the fictional demo tracker from
// demo-data.ts (short names per NOTES.md), never real applications.
// Pay figures on the sample cards are sample data too, marked as
// such on the cards themselves.
//
// No new dependencies: canvas 2D and CSS only, same as the hero.
// No em dashes anywhere in this file, in copy or comments.

export const HOW_IT_WORKS_STEP_COUNT = 5;

/** Fictional demo companies only, the demo tracker names. */
export const DEMO_COMPANIES = [
  "Northwind",
  "Copperline",
  "Atlas",
  "Fernhill",
  "Saltmarsh",
  "Verdant",
  "Tidewater",
  "Kestrel",
  "Oakline",
] as const;

export type DemoCompany = (typeof DEMO_COMPANIES)[number];

/** Pipeline stage colors, the same red, amber, green as the hero chips. */
export const STAGE_COLORS = {
  Applied: "#fd585d",
  OA: "#e8a83c",
  Interview: "#5eac6d",
  Offer: "#5eac6d",
} as const;

export type StageName = keyof typeof STAGE_COLORS;

export interface HowItWorksStep {
  id: string;
  num: string;
  title: string;
  body: string;
}

/**
 * The five steps. Copy is minimal and factual, built only from
 * words already on the page (hero and About feature copy): fresh
 * roles, the swipe deck, the tracker by stage, networking, and the
 * MCP agent. Nothing new is claimed here.
 */
export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    id: "find",
    num: "01",
    title: "Find roles matched to you",
    body: "Fresh postings that fit your level, newest first.",
  },
  {
    id: "swipe",
    num: "02",
    title: "Swipe to save",
    body: "Swipe to save and they land straight in your Leads, ready to apply.",
  },
  {
    id: "track",
    num: "03",
    title: "Track every application by stage",
    body: "Every application color coded by stage: Applied, OA, Interview, Offer.",
  },
  {
    id: "people",
    num: "04",
    title: "Line up the right people",
    body: "The recruiters and alumni behind each posting.",
  },
  {
    id: "agent",
    num: "05",
    title: "Let your agent do the busywork",
    body: "Your agent can run the busywork for you through MCP: read the tracker, add leads, update stages.",
  },
];

/** Clamp a number into 0 to 1. */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Wrap a time into one loop, so t and t + loop give the same frame. */
export function wrapTime(tMs: number, loopMs: number): number {
  if (loopMs <= 0) return 0;
  return ((tMs % loopMs) + loopMs) % loopMs;
}

/** Ease out cubic, the same settle as the hero and About reveals. */
export function easeOutCubic(p: number): number {
  const c = clamp01(p);
  return 1 - Math.pow(1 - c, 3);
}

export const MATCH_RING_LOOP_MS = 3600;
export const MATCH_SCORE = 92;

export interface MatchRingFrame {
  /** 0 at loop start, 1 when the ring is fully drawn. */
  progress: number;
  /** Score counting up with the ring, 0 to 92. */
  score: number;
}

/**
 * Step 1: the match ring draws itself around the score, then the
 * loop restarts. The ring eases out, so it lands softly instead of
 * snapping shut.
 */
export function matchRingFrame(tMs: number, loopMs = MATCH_RING_LOOP_MS): MatchRingFrame {
  const p = wrapTime(tMs, loopMs) / loopMs;
  const progress = easeOutCubic(p);
  return { progress, score: Math.round(MATCH_SCORE * progress) };
}

export const SWIPE_LOOP_MS = 4800;

export type SwipePhase = "hold" | "swiping" | "entering";

export interface SwipeCardFrame {
  translateX: number;
  rotateDeg: number;
  opacity: number;
  scale: number;
  phase: SwipePhase;
  /** Opacity of the Saved to Leads pill, 0 to 1. */
  savedOpacity: number;
}

/**
 * Step 2: the swipe deck swipes itself on a loop. The top card
 * holds, flies off to the right with a small rotation, and the next
 * card springs in from the left with a slight overshoot feel. The
 * Saved to Leads pill fades in as the card leaves and out as the
 * next card settles.
 */
export function swipeCardFrame(tMs: number, loopMs = SWIPE_LOOP_MS): SwipeCardFrame {
  const p = wrapTime(tMs, loopMs) / loopMs;
  if (p < 0.45) {
    return { translateX: 0, rotateDeg: 0, opacity: 1, scale: 1, phase: "hold", savedOpacity: 0 };
  }
  if (p < 0.65) {
    const q = easeOutCubic((p - 0.45) / 0.2);
    return {
      translateX: q * 220,
      rotateDeg: q * 14,
      opacity: 1 - q * 0.35,
      scale: 1,
      phase: "swiping",
      savedOpacity: q,
    };
  }
  if (p < 0.85) {
    const q = easeOutCubic((p - 0.65) / 0.2);
    return {
      translateX: -48 * (1 - q),
      rotateDeg: -4 * (1 - q),
      opacity: 0.6 + 0.4 * q,
      scale: 0.96 + 0.04 * q,
      phase: "entering",
      savedOpacity: 1 - q,
    };
  }
  return { translateX: 0, rotateDeg: 0, opacity: 1, scale: 1, phase: "hold", savedOpacity: 0 };
}

export const STAGE_FILL_LOOP_MS = 6000;
/** Each stage fills over 1400ms inside its 1800ms slot. */
export const STAGE_FILL_MS = 1400;
export const STAGE_SLOT_MS = 1800;

export interface StageFillFrame {
  applied: number;
  oa: number;
  interview: number;
  /** Index of the stage currently filling, 0 to 2, or 3 when done. */
  activeIndex: number;
  done: boolean;
}

/**
 * Step 3: one tracker row fills stage by stage. Applied fills
 * first, then OA, then Interview, each over 1400ms, with a short
 * pause between stages. At the end the row sits complete until the
 * loop restarts.
 */
export function stageFillProgress(tMs: number, loopMs = STAGE_FILL_LOOP_MS): StageFillFrame {
  const t = wrapTime(tMs, loopMs);
  const at = (i: number) => clamp01((t - i * STAGE_SLOT_MS) / STAGE_FILL_MS);
  const applied = at(0);
  const oa = at(1);
  const interview = at(2);
  const done = applied >= 1 && oa >= 1 && interview >= 1;
  const activeIndex = done ? 3 : applied < 1 ? 0 : oa < 1 ? 1 : 2;
  return { applied, oa, interview, activeIndex, done };
}

export const GRAPH_LOOP_MS = 5000;
export const GRAPH_EDGE_MS = 1300;
export const GRAPH_EDGE_GAP_MS = 1300;
export const GRAPH_NODE_COUNT = 4;

export interface GraphDrawFrame {
  /** Per edge draw progress, 0 to 1, in order. */
  edges: number[];
  /** Per node lit state: node 0 is always lit, node i lights when edge i-1 is drawn. */
  nodes: boolean[];
}

/**
 * Step 4: the network graph draws itself edge by edge. Each line
 * draws over 1300ms, then the next starts, and each person lights
 * up as their line reaches them.
 */
export function graphDrawProgress(tMs: number, loopMs = GRAPH_LOOP_MS): GraphDrawFrame {
  const t = wrapTime(tMs, loopMs);
  const edgeCount = GRAPH_NODE_COUNT - 1;
  const edges = Array.from({ length: edgeCount }, (_, i) =>
    clamp01((t - i * GRAPH_EDGE_GAP_MS) / GRAPH_EDGE_MS),
  );
  const nodes = Array.from({ length: GRAPH_NODE_COUNT }, (_, i) =>
    i === 0 ? true : edges[i - 1] >= 1,
  );
  return { edges, nodes };
}

/** The agent reply, typed word by word. Sample data, shown in full when still. */
export const AGENT_REPLY = "Done. Fernhill is in your tracker as Applied.";
export const AGENT_REPLY_WORDS = AGENT_REPLY.split(" ");
export const AGENT_PROMPT = "Add Fernhill to my tracker as Applied.";
export const TYPING_LOOP_MS = 8000;
export const TYPING_DOTS_MS = 1400;
export const TYPING_WORD_MS = 320;

export type TypingPhase = "typing" | "replying" | "done";

export interface TypingFrame {
  dotsVisible: boolean;
  wordsShown: number;
  phase: TypingPhase;
  done: boolean;
}

/**
 * Step 5: the agent chat. Typing dots show for 1400ms, then the
 * reply appears one word at a time, 320ms a word, and holds until
 * the loop restarts.
 */
export function typingProgress(tMs: number, loopMs = TYPING_LOOP_MS): TypingFrame {
  const t = wrapTime(tMs, loopMs);
  if (t < TYPING_DOTS_MS) {
    return { dotsVisible: true, wordsShown: 0, phase: "typing", done: false };
  }
  const wordsShown = Math.min(
    AGENT_REPLY_WORDS.length,
    Math.floor((t - TYPING_DOTS_MS) / TYPING_WORD_MS),
  );
  const done = wordsShown >= AGENT_REPLY_WORDS.length;
  return {
    dotsVisible: false,
    wordsShown,
    phase: done ? "done" : "replying",
    done,
  };
}

/**
 * Scroll progress through a section, as a pure function of scroll
 * position. 0 when the section top first touches the bottom of the
 * viewport, 1 when the section bottom has passed the top.
 */
export function sectionProgress(
  scrollY: number,
  sectionTop: number,
  sectionHeight: number,
  viewportH: number,
): number {
  if (viewportH <= 0 || sectionHeight <= 0) return 0;
  const total = sectionHeight + viewportH;
  return clamp01((scrollY + viewportH - sectionTop) / total);
}

export interface PulseDotFrame {
  /** Index of the step the dot is travelling toward, 0 to stepCount - 1. */
  stepIndex: number;
  /** Progress from this step to the next, 0 to 1. */
  stepProgress: number;
  /** The same progress as a fraction of the whole rail, 0 to 1. */
  railProgress: number;
}

/**
 * The pulse dot rider: a pure function of section scroll progress.
 * The dot travels the rail step by step, so at progress 0 it sits
 * on step 1 and at progress 1 it sits on the last step.
 */
export function pulseDotPosition(
  progress: number,
  stepCount = HOW_IT_WORKS_STEP_COUNT,
): PulseDotFrame {
  const p = clamp01(progress);
  if (stepCount <= 1) return { stepIndex: 0, stepProgress: 1, railProgress: p };
  if (p >= 1) {
    return { stepIndex: stepCount - 1, stepProgress: 1, railProgress: 1 };
  }
  const raw = p * (stepCount - 1);
  const stepIndex = Math.floor(raw);
  return { stepIndex, stepProgress: raw - stepIndex, railProgress: p };
}

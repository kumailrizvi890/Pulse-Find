import { demoApplications } from "./demo-data";

// Hero morph (landing only, Nov 20 2026): the three states the glass
// widget cycles through on an 8 second loop, told from the repo's demo
// data, never real user data. Applications is the demo tracker's size,
// OAs is how many demo applications have an assessment, Interviews is
// how many demo applications have at least one interview round done.
//
// Technique, borrowed from the energy-morph glass widget brief: one
// shared requestAnimationFrame loop, every motion a pure function of
// loop time, a glass shell built from layered divs, and numbers that
// travel in, hold, then travel out and cross-dissolve into the next
// state. The component owns the loop; this module owns the math, so
// the timing is unit-testable without a DOM.

export const LOOP_MS = 8000;

export interface MorphState {
  value: number;
  label: string;
  sub: string;
}

/** The three states, in loop order, from the demo tracker. */
export function morphStates(): MorphState[] {
  const apps = demoApplications();
  const oas = apps.filter((a) => a.oa_received).length;
  const interviews = apps.filter((a) => a.interviews_done > 0).length;
  return [
    { value: apps.length, label: "Applications tracked", sub: "Every stage, one dashboard" },
    { value: oas, label: "Assessments received", sub: "OAs land in your inbox, tracked here" },
    { value: interviews, label: "Interviews lined up", sub: "Rounds done, next steps on top" },
  ];
}

export interface MorphFrame {
  /** Index of the state on screen now. */
  index: number;
  /** 0 to 1: how far the incoming number has travelled in. */
  enter: number;
  /** 0 to 1: how far the outgoing number has travelled out. */
  exit: number;
  /** 0 to 1 across the whole 8s loop, for the progress dots. */
  progress: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
// Ease-out cubic: fast start, soft landing, same curve the glass
// brief uses for the travelling numbers.
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

/**
 * The frame for a moment in the loop. Each state owns an equal third
 * of the loop: the number travels in over the first 0.5s, holds for
 * about 1.7s, then travels out over the last 0.5s while the next state
 * is already travelling in, so the two numbers cross-dissolve.
 */
export function stateAt(tMs: number): MorphFrame {
  const t = ((tMs % LOOP_MS) + LOOP_MS) % LOOP_MS;
  const slot = LOOP_MS / 3;
  const index = Math.floor(t / slot) % 3;
  const local = t - index * slot;
  const enter = easeOut(local / 500);
  const exit = easeOut((local - (slot - 500)) / 500);
  return { index, enter, exit, progress: t / LOOP_MS };
}

/** The number to show for a state: the incoming value once it has arrived. */
export function visibleValue(states: MorphState[], frame: MorphFrame): number {
  return states[frame.index].value;
}

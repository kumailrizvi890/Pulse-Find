// Scroll animation math (landing only, Nov 20 2026): every scroll
// driven motion on the landing is a pure function in this module, so
// the timing is unit-testable without a DOM and the components are
// just the loops that read it. No new dependencies, no DOM access
// here, no em dashes anywhere in this file.
//
// The landing uses these for the scroll progress ECG line, the
// aurora and particle scroll response, the founder photo parallax,
// the springy reveal stagger, the count-up, and the weighted
// pointer tilt (a real spring, so the product window feels like it
// has mass instead of snapping to the cursor).

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * How far an element has travelled through the viewport, 0 to 1.
 * scrollY is the page scroll, elementTop the element's document
 * offset, elementHeight its height, viewportH the viewport height.
 * 0 when the element's top first touches the viewport bottom, 1
 * when its bottom has left the viewport top, 0.5 when it is
 * centred. Anything outside that range clamps.
 */
export function sectionProgress(
  scrollY: number,
  elementTop: number,
  elementHeight: number,
  viewportH: number,
): number {
  if (viewportH <= 0 || elementHeight <= 0) return 0;
  const rectTop = elementTop - scrollY;
  return clamp01((viewportH - rectTop) / (viewportH + elementHeight));
}

/**
 * Springy overshoot easing, 0 to 1 in, 0 to 1 out, with a small
 * overshoot past 1 mid-flight (about 1.1 at its peak). The reveal
 * curve in CSS (cubic-bezier(0.22, 1.35, 0.36, 1)) is the same
 * shape, so JS and CSS spring together.
 */
export function easeOutBack(t: number): number {
  const x = clamp01(t);
  if (x === 0) return 0;
  if (x === 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Ease-out cubic, the count-up curve: fast start, soft landing. */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

/**
 * A parallax translate in px for a scroll progress: -maxPx when the
 * section enters, 0 when it is centred, +maxPx when it leaves.
 * The founder photo uses maxPx 24, so it drifts gently instead of
 * jumping.
 */
export function parallaxOffset(progress: number, maxPx: number): number {
  return (clamp01(progress) - 0.5) * 2 * maxPx;
}

/**
 * The count-up value at elapsedMs into a durationMs run toward
 * final, eased out cubic and rounded to a whole number. Past the
 * duration it stays at final; a zero duration shows final at once.
 */
export function countUpValue(final: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return final;
  const p = clamp01(elapsedMs / durationMs);
  return Math.round(final * easeOutCubic(p));
}

/**
 * Page scroll progress as a 0 to 100 fill for the scroll progress
 * ECG line at the top of the landing. 0 is the top of the page,
 * 100 is the bottom.
 */
export function scrollProgressLine(progress: number): number {
  return clamp01(progress) * 100;
}

/**
 * The ECG progress line draws itself as you scroll: for a path of
 * the given length, this is the stroke-dashoffset that leaves
 * exactly the scrolled fraction drawn. Full length at the top of
 * the page, zero at the bottom.
 */
export function ecgOffset(progress: number, length: number): number {
  return Math.max(0, length) * (1 - clamp01(progress));
}

export interface AuroraShift {
  /** Horizontal drift in percent of the aurora's own width. */
  x: number;
  /** Vertical drift in percent of the aurora's own height. */
  y: number;
  /** Scale factor, 1 at rest. */
  scale: number;
}

/**
 * The aurora's response to scroll progress: it drifts up and to
 * the left and grows slightly as the hero scrolls away, faint
 * atmosphere, never a glowing backdrop. Values are small on
 * purpose: at full scroll the shift is 3 percent left, 4 percent
 * up, scale 1.05.
 */
export function auroraShift(progress: number): AuroraShift {
  const p = clamp01(progress);
  return { x: -3 * p + 0, y: 4 * p, scale: 1 + 0.05 * p };
}

/**
 * A stagger delay in ms for item index in a revealing list: base
 * plus step per index, capped so a long list never waits forever.
 * Negative indexes behave like the first item.
 */
export function staggerDelay(index: number, baseMs: number, stepMs: number, capMs: number): number {
  return Math.min(capMs, Math.max(0, baseMs + Math.max(0, index) * stepMs));
}

export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * One step of a damped spring toward a target, semi-implicit Euler.
 * Stiffness pulls it in, damping bleeds energy: below critical
 * damping (2 times sqrt(stiffness)) it overshoots and settles, which
 * is the weight in the product window tilt. The hero uses
 * stiffness 120 and damping 14, underdamped on purpose, so the
 * window leans into the pointer and rocks back instead of snapping.
 * Pure in its inputs, so the tilt is testable without a pointer.
 */
export function springStep(
  current: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): SpringState {
  const step = Math.max(0, dt);
  const accel = -stiffness * (current - target) - damping * velocity;
  const nextVelocity = velocity + accel * step;
  return { value: current + nextVelocity * step, velocity: nextVelocity };
}

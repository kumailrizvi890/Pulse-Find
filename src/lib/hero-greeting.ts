// Hero greeting v3 (landing only, Nov 20 2026): the welcome moment.
// Pulse greets on arrival, then stays as a live interactive 3D scene.
// The greeting is one master timeline, scrubbed by the pointer:
//
//   * A glowing red pulse crystal assembles from orbiting particles,
//     with the ECG pulse line drawing itself in 3D around it.
//   * The headline reveals with a scramble-in: random chars resolving
//     left to right per word, starting after the same 800ms delay.
//   * After the greeting, horizontal pointer movement scrubs the
//     timeline forward and back (delta-based, sensitivity 0.8, in the
//     SynapseX manner), so a visitor can replay the greeting by moving
//     the mouse. Touch drag scrubs, tap replays. Pointer position also
//     keeps rotating the scene, so the crystal stays live either way.
//
// Everything here is a pure function of time, pointer, or greeting
// progress, so the timing is unit-testable without a DOM and the
// component is just the loop that reads it (see HeroCrazy.tsx).
// The scene is hand-rolled canvas 2.5D, not Three.js: the geometry is
// one convex crystal, a particle cloud, and a ring polyline, all real
// 3D math (rotation matrices, perspective divide, depth sorting). A
// full WebGL engine would put ~150KB before first paint for that,
// plus a WebGL failure mode the canvas version never has. See
// NOTES.md for the full Three.js-vs-canvas decision.

import { mulberry32 } from "@/lib/hero-crazy";
import type { DeviceTier } from "@/lib/hero-crazy";

/** The welcome delay before the greeting starts, in ms. */
export const GREETING_DELAY_MS = 800;
/** The greeting timeline length, in ms. The headline finishes at
 *  1400ms inside it; the crystal settles by the end. */
export const GREETING_MS = 2200;
/** How long one word takes to unscramble, in ms. Matches the v2
 *  word reveal run of 0.8s, so the total reveal stays under the 3s cap. */
export const SCRAMBLE_WORD_MS = 800;
/** Stagger between words, in ms. Same 0.09s stagger as the v2 reveal. */
export const SCRAMBLE_WORD_STAGGER_MS = 90;
/** Scrub sensitivity: a full-width horizontal sweep moves the
 *  greeting by this fraction of its length (SynapseX-style 0.8). */
export const SCRAMBLE_SENSITIVITY = 0.8;
/** Idle time after the last scrub before the greeting resumes
 *  assembling itself toward the end. */
export const GREETING_RESUME_IDLE_MS = 2500;
/** Scramble alphabet: digits and symbols only, never a letter, so a
 *  scrambled char can never coincidentally equal the real char in a
 *  headline word. No em dash anywhere in it. */
export const SCRAMBLE_CHARSET = "0123456789#$%&*?<>@+/=";

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Smoothstep between two edges: 0 below a, 1 above b, eased between. */
export function smoothstep(a: number, b: number, x: number): number {
  if (b <= a) return x >= b ? 1 : 0;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Greeting progress 0 to 1 from the master timeline clock. The clock
 * starts at -GREETING_DELAY_MS (the welcome delay) and runs to
 * GREETING_MS. Scrubbing moves the clock; this just reads it.
 */
export function greetingProgress(timeMs: number): number {
  return clamp01(timeMs / GREETING_MS);
}

/** Clamp the master clock to its legal range, delay included. */
export function clampGreetingTime(timeMs: number): number {
  return Math.min(GREETING_MS, Math.max(-GREETING_DELAY_MS, timeMs));
}

export interface GreetingPhases {
  /** 0 to 1: particles converge from orbit onto the crystal vertices. */
  assemble: number;
  /** 0 to 1: the crystal faces fade in and the glow comes up. */
  solidify: number;
  /** 0 to 1: how much of the ECG ring is drawn around the crystal. */
  ring: number;
  /** 0 to 1: the greeting settles into its idle live state. */
  settle: number;
}

/** The four overlapping phases of the greeting, as a function of progress. */
export function greetingPhases(g: number): GreetingPhases {
  return {
    assemble: smoothstep(0, 0.45, g),
    solidify: smoothstep(0.35, 0.7, g),
    ring: smoothstep(0.5, 0.8, g),
    settle: smoothstep(0.75, 1, g),
  };
}

/**
 * Scrub delta in timeline ms for a horizontal pointer move of dxPx
 * across a hero of widthPx. Delta-based, so seeks chain: the render
 * is a pure function of the clock, so no frame can ever drop.
 */
export function scrubTimeDelta(
  dxPx: number,
  widthPx: number,
  sensitivity: number = SCRAMBLE_SENSITIVITY,
): number {
  if (widthPx <= 0) return 0;
  return (dxPx * sensitivity * GREETING_MS) / widthPx;
}

/**
 * One headline word's scramble progress at a moment in the greeting
 * clock. Word i starts SCRAMBLE_WORD_STAGGER_MS after word i-1 and
 * takes SCRAMBLE_WORD_MS to resolve.
 */
export function wordScrambleProgress(timeMs: number, wordIndex: number): number {
  return clamp01((timeMs - wordIndex * SCRAMBLE_WORD_STAGGER_MS) / SCRAMBLE_WORD_MS);
}

/** Total headline reveal time for n words, from the greeting start. */
export function scrambleTotalMs(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return (wordCount - 1) * SCRAMBLE_WORD_STAGGER_MS + SCRAMBLE_WORD_MS;
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * The scramble char for one character slot at one flicker step.
 * Deterministic in (word, charIndex, step), so a frame renders the
 * same chars every time and the scramble never flickers on re-render.
 */
export function scrambleChar(word: string, charIndex: number, step: number): string {
  const h = hashString(`${word}:${charIndex}:${step}`);
  return SCRAMBLE_CHARSET[h % SCRAMBLE_CHARSET.length];
}

/**
 * One word mid-scramble: chars resolve left to right, each char
 * resolving once progress passes (i + 1) / length. Progress 0 is all
 * scramble chars, progress 1 is the word itself.
 */
export function scrambleWord(word: string, progress: number): string {
  const len = word.length;
  if (len === 0) return "";
  const p = clamp01(progress);
  if (p >= 1) return word;
  const step = Math.floor(p * 12);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += p >= (i + 1) / len ? word[i] : scrambleChar(word, i, step);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3D math: rotation, perspective projection, crystal geometry.
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Rotate a point around the X axis by angle a (radians). */
export function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

/** Rotate a point around the Y axis by angle a (radians). */
export function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

export interface Projected {
  /** Projected x in crystal units, before scaling to pixels. */
  x: number;
  /** Projected y in crystal units, before scaling to pixels. */
  y: number;
  /** Perspective factor: above 1 when near the viewer, below 1 when far. */
  depth: number;
}

/**
 * Perspective projection: points nearer the viewer (positive z) grow,
 * points farther away shrink. Focal length 4.2 crystal units keeps
 * the perspective visible without warping the crystal.
 */
export function project(v: Vec3, focal: number = 4.2): Projected {
  const f = focal <= 0 ? 1 : focal;
  const depth = f / (f - v.z);
  return { x: v.x * depth, y: v.y * depth, depth };
}

/** The pulse crystal: a stretched octahedron, 6 vertices, 8 faces. */
export function crystalVertices(): Vec3[] {
  return [
    { x: 0, y: 1.7, z: 0 },
    { x: 0, y: -1.7, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
  ];
}

export type Face = [number, number, number];

/** The 8 triangular faces, as vertex index triples. */
export function crystalFaces(): Face[] {
  return [
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 5],
    [0, 5, 2],
    [1, 3, 2],
    [1, 4, 3],
    [1, 5, 4],
    [1, 2, 5],
  ];
}

/** Unit normal of the triangle a, b, c. Zero-area faces get up. */
export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len === 0) return { x: 0, y: 1, z: 0 };
  return { x: nx / len, y: ny / len, z: nz / len };
}

const LIGHT: Vec3 = { x: 0.45, y: 0.75, z: 0.5 };
const LIGHT_LEN = Math.sqrt(LIGHT.x * LIGHT.x + LIGHT.y * LIGHT.y + LIGHT.z * LIGHT.z);

/**
 * Face brightness 0 to 1 from its normal against a fixed light up,
 * front, and right. Absolute value, so front and back faces of the
 * glass read the same and winding never matters.
 */
export function faceShade(normal: Vec3): number {
  const dot =
    (normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z) / LIGHT_LEN;
  return 0.35 + 0.65 * Math.abs(dot);
}

// ---------------------------------------------------------------------------
// Greet particles: the cloud the crystal assembles from.
// ---------------------------------------------------------------------------

export interface GreetParticle {
  /** Orbit angle around the crystal, radians. */
  angle: number;
  /** Orbit radius in crystal units. */
  radius: number;
  /** Orbit height in crystal units. */
  height: number;
  /** Orbit speed, radians per second. */
  speed: number;
  /** Base draw size in px. */
  size: number;
  /** Which crystal vertex this particle assembles onto. */
  vertex: number;
}

/** The assemble cloud: seeded, so the first frame is deterministic. */
export function greetParticles(seed: number, count: number): GreetParticle[] {
  const rand = mulberry32(seed);
  const out: GreetParticle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      angle: rand() * Math.PI * 2,
      radius: 1.9 + rand() * 0.8,
      height: (rand() - 0.5) * 2.2,
      speed: 0.12 + rand() * 0.33,
      size: 0.9 + rand() * 1.1,
      vertex: i % 6,
    });
  }
  return out;
}

/** Greet particle budget per tier: the lite field stays cheap. */
export function greetParticleCount(tier: DeviceTier): number {
  if (tier === "full") return 110;
  if (tier === "lite") return 56;
  return 0;
}

/**
 * One greet particle's 3D position at loop time t and assembly
 * progress assemble (0 is full orbit, 1 is on its vertex, with a
 * small halo kept so the assembled crystal still shimmers).
 */
export function greetParticleAt(
  p: GreetParticle,
  t: number,
  assemble: number,
  vertices: Vec3[],
): Vec3 {
  const a = p.angle + t * p.speed;
  const orbit: Vec3 = {
    x: Math.cos(a) * p.radius,
    y: p.height + Math.sin(t * 0.6 + p.angle * 2) * 0.12,
    z: Math.sin(a) * p.radius,
  };
  const target = vertices[p.vertex % vertices.length] ?? { x: 0, y: 0, z: 0 };
  const spread = 1 - assemble;
  return {
    x: target.x + (orbit.x - target.x) * spread + orbit.x * 0.12 * assemble,
    y: target.y + (orbit.y - target.y) * spread + orbit.y * 0.12 * assemble,
    z: target.z + (orbit.z - target.z) * spread + orbit.z * 0.12 * assemble,
  };
}

// ---------------------------------------------------------------------------
// ECG ring: the pulse line drawn in 3D around the crystal.
// ---------------------------------------------------------------------------

function triPulse(u: number, center: number, halfWidth: number, amp: number): number {
  if (halfWidth <= 0) return 0;
  return amp * Math.max(0, 1 - Math.abs(u - center) / halfWidth);
}

/**
 * The brand ECG waveform as a radial offset over one cycle, u in
 * [0, 1): flat baseline, a small P rise, a Q dip, one tall R spike,
 * an S dip, and a T bump. Same shape as the PulseMark path in
 * Logo.tsx, as a function instead of an SVG path.
 */
export function ecgWave(u: number): number {
  const x = ((u % 1) + 1) % 1;
  return (
    triPulse(x, 0.1, 0.06, 0.16) +
    triPulse(x, 0.2, 0.03, -0.18) +
    triPulse(x, 0.26, 0.045, 1) +
    triPulse(x, 0.33, 0.04, -0.38) +
    triPulse(x, 0.55, 0.09, 0.22)
  );
}

/** One point of the ECG ring: a horizontal circle with the ECG wave as radial displacement. */
export function ecgRingPoint(u: number, radius: number): Vec3 {
  const angle = u * Math.PI * 2;
  const r = radius * (1 + 0.2 * ecgWave(u));
  return { x: Math.cos(angle) * r, y: 0, z: Math.sin(angle) * r };
}

// ---------------------------------------------------------------------------
// Scene orientation and layout.
// ---------------------------------------------------------------------------

export interface GreetingRotation {
  rotX: number;
  rotY: number;
}

/**
 * The crystal's rotation at greeting progress g, pointer position,
 * and loop time t. The greeting itself turns the crystal from -0.9
 * to 0.5 radians as it assembles; the pointer adds up to 0.9 radians
 * of lean; after the greeting a slow idle spin takes over.
 */
export function greetingRotation(
  g: number,
  pointerX: number,
  pointerY: number,
  t: number,
): GreetingRotation {
  return {
    rotX: 0.16 + (pointerY - 0.5) * 0.5,
    rotY: -0.9 + g * 1.4 + (pointerX - 0.5) * 0.9 + t * 0.12 * g,
  };
}

export interface CrystalLayout {
  /** Crystal center x, in canvas pixels. */
  cx: number;
  /** Crystal center y, in canvas pixels. */
  cy: number;
  /** Crystal radius in canvas pixels (one crystal unit). */
  radius: number;
  /** Scene alpha: phones run dimmer so the headline stays readable. */
  alpha: number;
}

/**
 * Where the crystal sits in the hero. Desktop: upper right, above the
 * product window, rising from behind it. Phones: a small crystal in
 * the top-right corner, clear of the kicker and headline.
 */
export function crystalLayout(width: number, height: number): CrystalLayout {
  if (width <= 0 || height <= 0) return { cx: 0, cy: 0, radius: 0, alpha: 0 };
  if (width >= 821) {
    const radius = Math.min(200, Math.max(120, Math.min(width, height) * 0.19));
    return { cx: width * 0.78, cy: height * 0.24, radius, alpha: 0.95 };
  }
  const radius = Math.min(84, Math.max(54, width * 0.17));
  return { cx: width * 0.84, cy: 92, radius, alpha: 0.85 };
}

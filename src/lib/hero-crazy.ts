// Hero crazy-3D math (landing only, Nov 20 2026): every moving part
// of the crazy hero is a pure function, so the timing is unit-testable
// without a DOM and the component is just the loop that reads it.
//
// The hero has three layers, all driven by one shared rAF loop in
// HeroCrazy.tsx:
//   1. A canvas particle field behind everything (positions from a
//      seeded PRNG, so the first frame is deterministic).
//   2. The glass morph card from hero-morph.ts, tilted in CSS 3D by
//      the pointer and morphed away by scroll as the About section
//      arrives.
//   3. The headline, revealed word by word with masked rises.
//
// No new dependencies: three / @react-three/fiber are not in the
// repo, and adding them would put ~150KB+ of WebGL before first
// paint for a backdrop. The particle field is plain canvas 2D,
// about 2KB of code, DPR capped at 2, and it degrades to a static
// gradient on weak devices (see deviceTier).

export interface Tilt {
  rotateX: number;
  rotateY: number;
}

/** Pointer tilt for the glass card: -maxDeg to +maxDeg on each axis. */
export function tiltFromPointer(
  x: number,
  y: number,
  width: number,
  height: number,
  maxDeg = 10,
): Tilt {
  if (width <= 0 || height <= 0) return { rotateX: 0, rotateY: 0 };
  const nx = Math.min(1, Math.max(-1, (x / width - 0.5) * 2));
  const ny = Math.min(1, Math.max(-1, (y / height - 0.5) * 2));
  return { rotateX: -ny * maxDeg, rotateY: nx * maxDeg };
}

/** Eased lerp toward a target: the tilt never snaps, it settles. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export interface HeroScrollFrame {
  /** Card rotateX in degrees as scroll carries it away. */
  cardRotateX: number;
  /** Card scale as it recedes into the About section. */
  cardScale: number;
  /** Card opacity as it leaves. */
  cardOpacity: number;
  /** Copy drifts up and fades slightly faster than the card. */
  copyY: number;
  copyOpacity: number;
  /** Particle field drifts at 0.2x: the depth cue. */
  fieldY: number;
}

/**
 * The scroll choreography as a pure function of scroll position.
 * scrollY 0 is the hero at rest; progress 1 is the hero fully
 * scrolled past (one viewport of scroll). Everything eases out,
 * nothing jumps, and scrolling back reverses it for free.
 */
export function heroScrollFrame(scrollY: number, viewportH: number): HeroScrollFrame {
  const p = viewportH > 0 ? Math.min(1, Math.max(0, scrollY / viewportH)) : 0;
  const e = 1 - Math.pow(1 - p, 3);
  return {
    cardRotateX: e * 18,
    cardScale: 1 - e * 0.12,
    cardOpacity: 1 - e * 0.85,
    copyY: -e * 60,
    copyOpacity: 1 - e,
    fieldY: scrollY * 0.2,
  };
}

export type DeviceTier = "full" | "lite" | "still";

export interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData?: boolean;
  width?: number;
  reducedMotion?: boolean;
}

/**
 * Tier the experience before downloading or running anything heavy.
 * Reduced motion always gets the still. Low memory, few cores, or
 * data saver gets the lite field (fewer particles, DPR 1). Small
 * phones get lite too: the field is atmosphere, not content.
 */
export function deviceTier(h: DeviceHints): DeviceTier {
  if (h.reducedMotion) return "still";
  if (h.saveData) return "lite";
  if (h.deviceMemory !== undefined && h.deviceMemory <= 4) return "lite";
  if (h.hardwareConcurrency !== undefined && h.hardwareConcurrency <= 4) return "lite";
  if (h.width !== undefined && h.width < 640) return "lite";
  return "full";
}

/** Particle budget per tier: full is the showpiece, lite stays cheap. */
export function particleCount(tier: DeviceTier): number {
  if (tier === "full") return 140;
  if (tier === "lite") return 48;
  return 0;
}

/** DPR cap per tier, never above 2. */
export function dprCap(tier: DeviceTier): number {
  return tier === "full" ? 2 : 1;
}

/** Deterministic PRNG (mulberry32) so the field is stable per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Particle {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  red: boolean;
}

/** The field's starting layout, in fractions of the canvas size. */
export function particleField(seed: number, count: number): Particle[] {
  const rand = mulberry32(seed);
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rand(),
      y: rand(),
      r: 0.6 + rand() * 1.8,
      speed: 0.008 + rand() * 0.03,
      drift: (rand() - 0.5) * 0.02,
      red: rand() < 0.22,
    });
  }
  return out;
}

/**
 * One particle's position at loop time t (seconds): slow rise, gentle
 * sideways drift, wrapping at the edges. Pure in t, like the morph.
 */
export function particleAt(p: Particle, t: number): { x: number; y: number } {
  const y = (((p.y - p.speed * t) % 1) + 1) % 1;
  const x = (((p.x + p.drift * t + Math.sin(t * 0.4 + p.y * 12) * 0.006) % 1) + 1) % 1;
  return { x, y };
}

// Pulse, the 3D hero mascot (landing only, Nov 22 2026).
//
// Pure choreography for the plush Pulse bear: the greeting he plays
// on load (pop in, land with a squash, wave hello with his right arm,
// then turn all the way round like the reference video), the
// heartbeat that drives his belly ECG, blinking, where he looks, and
// the reactions he plays when tapped. Everything here is a pure
// function of time and input so the scene module only has to read
// numbers and write them onto meshes, and so it is unit-testable
// without WebGL.

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function easeOutBack(t: number, s = 1.70158): number {
  const x = clamp01(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 0 -> 1 -> 0 bell over [a, b]. */
function bump(t: number, a: number, b: number): number {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
}

/** Greeting beats, in seconds from the moment Pulse is on stage. */
export const GREET = {
  popEnd: 0.7,
  waveStart: 0.55,
  waveEnd: 3.6,
  turnStart: 3.7,
  turnEnd: 5.7,
  total: 5.9,
} as const;

export interface Pose {
  /** Uniform scale of the whole bear (pop in). */
  scale: number;
  /** Vertical offset in world units (drop in, jumps). */
  lift: number;
  /** Squash: >0 flattens (landing), <0 stretches (take-off). */
  squash: number;
  /** Right-arm raise, 0 = resting, 1 = fully up. */
  armRaise: number;
  /** Right-arm wave swing, -1..1. */
  armWave: number;
  /** Mouth open, 0 = smile, 1 = open grin. */
  mouthOpen: number;
  /** Extra body yaw in radians (the 360 turn, spins). */
  turn: number;
  /** Head tilt in radians (toward the waving arm). */
  headTilt: number;
  /** How much pointer tracking applies, 0..1. */
  lookWeight: number;
  /** Happy squint, 0..1. */
  happy: number;
}

export const REST_POSE: Pose = {
  scale: 1,
  lift: 0,
  squash: 0,
  armRaise: 0,
  armWave: 0,
  mouthOpen: 0,
  turn: 0,
  headTilt: 0,
  lookWeight: 1,
  happy: 0,
};

/** The greeting at time t (seconds). t < 0 means not on stage yet. */
export function greetingPose(t: number): Pose {
  if (t < 0) return { ...REST_POSE, scale: 0, lookWeight: 0 };
  if (t >= GREET.total) return { ...REST_POSE };

  // Pop in: scale overshoots, drops from above, squashes on landing.
  const pop = clamp01(t / GREET.popEnd);
  const scale = Math.max(0, easeOutBack(pop, 2.2));
  const lift = (1 - easeOutBack(pop, 1.2)) * 0.3;
  const squash = bump(t, 0.45, 0.85) * 0.18 - bump(t, 0.05, 0.4) * 0.1;

  // Wave: raise, swing three times, lower. The swing is wide on
  // purpose: at the hero's render size a small wrist flick does not
  // read as a wave, so the hand sweeps from out to the side to
  // nearly straight up, several times, before the turn.
  const raiseIn = easeInOutCubic((t - GREET.waveStart) / 0.35);
  const raiseOut = easeInOutCubic((GREET.waveEnd - t) / 0.4);
  const armRaise = Math.min(raiseIn, raiseOut);
  const waveT = t - GREET.waveStart - 0.3;
  const armWave = waveT > 0 ? Math.sin(waveT * Math.PI * 2 * 1.5) * armRaise : 0;
  const mouthOpen = armRaise;
  const headTilt = armRaise * 0.14;

  // The turn: one full revolution, eased, like the reference video.
  const turn = easeInOutCubic((t - GREET.turnStart) / (GREET.turnEnd - GREET.turnStart)) * Math.PI * 2;

  // Tracking fades in after the turn so he settles facing you.
  const lookWeight = clamp01((t - GREET.turnEnd) / 0.2) * 0.999 + (t < GREET.turnStart ? armRaise * 0.3 : 0);

  return {
    scale,
    lift,
    squash,
    armRaise,
    armWave,
    mouthOpen,
    turn,
    headTilt,
    lookWeight: Math.min(1, lookWeight),
    happy: armRaise * 0.6,
  };
}

/**
 * Heartbeat at 72 bpm, lub-dub: a tall beat then a smaller one,
 * 0..1. Drives the belly ECG glow and the chest light.
 */
export function heartbeat(t: number, bpm = 72): number {
  const period = 60 / bpm;
  const p = ((t % period) + period) % period / period;
  const lub = Math.exp(-Math.pow((p - 0.08) / 0.035, 2));
  const dub = 0.55 * Math.exp(-Math.pow((p - 0.26) / 0.04, 2));
  return Math.min(1, lub + dub);
}

/**
 * Blink: eyes closed fraction 0..1. Blinks roughly every 2.6 to
 * 4.6s, deterministic per seed, each blink 140ms, with an occasional
 * double blink.
 */
export function blinkAmount(t: number, seed = 7): number {
  const slot = 3.6;
  const i = Math.floor(t / slot);
  const jitter = (Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
  const at = i * slot + 1 + Math.abs(jitter) * 2;
  const close = (x: number) => bump(x, 0, 0.14);
  const first = close(t - at);
  const double = Math.abs(jitter) > 0.7 ? close(t - at - 0.22) : 0;
  return Math.max(first, double);
}

/**
 * Where Pulse looks for a pointer at (nx, ny), each -1..1 from the
 * centre of the stage. Clamped so his head never snaps all the way
 * round: yaw +-0.6 rad, pitch +-0.32 rad.
 */
export function lookAngles(nx: number, ny: number): { yaw: number; pitch: number } {
  const x = Math.max(-1, Math.min(1, nx));
  const y = Math.max(-1, Math.min(1, ny));
  return { yaw: x * 0.6, pitch: y * 0.32 };
}

export type Reaction = "jump" | "spin" | "wave" | "heart" | "giggle";

/** Reaction length in seconds. */
export const REACTION_S: Record<Reaction, number> = {
  jump: 0.9,
  spin: 1.1,
  wave: 1.8,
  heart: 1.2,
  giggle: 0.9,
};

/**
 * Which reaction a tap plays. Taps on the head giggle, taps on the
 * belly fire a heartbeat, anywhere else cycles jump, spin, wave.
 */
export function pickReaction(zone: string | null, tapCount: number): Reaction {
  if (zone === "head") return "giggle";
  if (zone === "belly") return "heart";
  const cycle: Reaction[] = ["jump", "spin", "wave"];
  return cycle[((tapCount % cycle.length) + cycle.length) % cycle.length];
}

/** A reaction layered over the rest pose at time t into it. */
export function reactionPose(kind: Reaction, t: number): Partial<Pose> & { flare?: number } {
  const d = REACTION_S[kind];
  if (t < 0 || t > d) return {};
  const k = t / d;
  switch (kind) {
    case "jump": {
      const air = bump(t, 0.12, 0.72);
      return {
        lift: air * 0.28,
        squash: bump(t, 0, 0.14) * 0.16 - air * 0.12 + bump(t, 0.7, 0.9) * 0.16,
        mouthOpen: air,
        happy: air,
        armRaise: air * 0.55,
      };
    }
    case "spin":
      return {
        turn: easeInOutCubic(k) * Math.PI * 2,
        lift: bump(t, 0.1, 0.9) * 0.2,
        mouthOpen: bump(t, 0, d),
        lookWeight: 1 - bump(t, 0, d),
      };
    case "wave": {
      const raise = Math.min(easeInOutCubic(t / 0.3), easeInOutCubic((d - t) / 0.35));
      return {
        armRaise: raise,
        armWave: Math.sin((t - 0.2) * Math.PI * 2 * 1.4) * raise,
        mouthOpen: raise,
        headTilt: raise * 0.14,
        happy: raise * 0.6,
      };
    }
    case "heart":
      return { flare: bump(t, 0, d * 0.7), happy: bump(t, 0, d), squash: bump(t, 0, 0.25) * -0.06 };
    case "giggle":
      return {
        headTilt: Math.sin(t * 24) * 0.12 * (1 - k),
        happy: 1 - k * 0.3,
        mouthOpen: bump(t, 0, d),
        squash: Math.sin(t * 24) * 0.03 * (1 - k),
      };
  }
}

/** Layer a partial pose over a base pose (additive where it makes sense). */
export function layerPose(base: Pose, add: Partial<Pose>): Pose {
  return {
    scale: base.scale,
    lift: base.lift + (add.lift ?? 0),
    squash: base.squash + (add.squash ?? 0),
    armRaise: Math.max(base.armRaise, add.armRaise ?? 0),
    armWave: base.armWave + (add.armWave ?? 0),
    mouthOpen: Math.max(base.mouthOpen, add.mouthOpen ?? 0),
    turn: base.turn + (add.turn ?? 0),
    headTilt: base.headTilt + (add.headTilt ?? 0),
    lookWeight: Math.min(base.lookWeight, add.lookWeight ?? 1),
    happy: Math.max(base.happy, add.happy ?? 0),
  };
}

/**
 * Drag spin with inertia: while dragging the angle follows the hand;
 * on release it coasts with friction, then springs back to the
 * nearest whole turn so Pulse always ends up facing you.
 */
export function spinStep(
  angle: number,
  velocity: number,
  dragging: boolean,
  dt: number,
): { angle: number; velocity: number } {
  if (dragging) return { angle, velocity };
  const home = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
  const friction = Math.exp(-3.2 * dt);
  let v = velocity * friction;
  if (Math.abs(v) < 2.5) v += -(angle - home) * 28 * dt - v * 6 * dt;
  return { angle: angle + v * dt, velocity: v };
}

/** True when a pointer press counts as a tap, not a drag. */
export function isTap(dx: number, dy: number, ms: number): boolean {
  return Math.hypot(dx, dy) < 8 && ms < 450;
}

/** What Pulse says. No em dashes, short, in the product's voice. */
export const GREETING_LINE = "Hi, I'm Pulse!";
export const PULSE_LINES: Record<Reaction, string[]> = {
  jump: ["Boing!", "5 interviews lined up!", "Let's land this one."],
  spin: ["Wheee!", "Every application, tracked.", "Dizzy... but organized."],
  wave: ["Hello again!", "Fresh roles every morning.", "I keep your pipeline alive."],
  heart: ["That's my pulse!", "22 applications and counting.", "Beating for your next offer."],
  giggle: ["Hehe, that tickles!", "Hey! That's my screen.", "Boop."],
};

export function lineFor(kind: Reaction, n: number): string {
  const lines = PULSE_LINES[kind];
  return lines[((n % lines.length) + lines.length) % lines.length];
}

/**
 * The ECG waveform on Pulse's belly, as (x, y) points in belly units
 * (x -1..1). Flat baseline, small rise, one tall spike, one deep dip,
 * back to baseline: the same shape as the PulseWaveform brand mark.
 */
export function ecgPoints(): { x: number; y: number }[] {
  return [
    { x: -1, y: 0 },
    { x: -0.34, y: 0 },
    { x: -0.24, y: 0.16 },
    { x: -0.16, y: -0.12 },
    { x: -0.06, y: 0.62 },
    { x: 0.05, y: -0.5 },
    { x: 0.14, y: 0.12 },
    { x: 0.22, y: 0 },
    { x: 1, y: 0 },
  ];
}

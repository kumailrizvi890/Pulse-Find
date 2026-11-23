import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GREET,
  GREETING_LINE,
  PULSE_LINES,
  REACTION_S,
  REST_POSE,
  blinkAmount,
  ecgPoints,
  easeInOutCubic,
  easeOutBack,
  greetingPose,
  heartbeat,
  isTap,
  layerPose,
  lineFor,
  lookAngles,
  pickReaction,
  reactionPose,
  spinStep,
} from "@/lib/pulse-bear";

// Pulse in 3D (landing, Nov 22 2026): the plush Pulse bear flies his
// glass-bubble hover pod into the landing hero, greets, and plays with
// the pointer. Choreography is pure math in src/lib/pulse-bear.ts;
// three.js lives only in the lazily loaded PulseBear3D chunk.

const root = join(__dirname, "..", "..");
const repoRoot = join(root, "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const home = read("app/page.tsx");
const hero = read("components/landing/HeroCrazy.tsx");
const bear = read("components/landing/PulseBear3D.tsx");
const scene = read("components/landing/pulse-bear-scene.ts");
const css = read("app/globals.css");

describe("easing", () => {
  it("starts at 0 and lands on 1", () => {
    for (const f of [easeInOutCubic, (t: number) => easeOutBack(t)]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
  });

  it("overshoots with back easing, never with in-out", () => {
    let maxBack = 0;
    let maxCubic = 0;
    for (let i = 0; i <= 100; i++) {
      maxBack = Math.max(maxBack, easeOutBack(i / 100));
      maxCubic = Math.max(maxCubic, easeInOutCubic(i / 100));
    }
    expect(maxBack).toBeGreaterThan(1);
    expect(maxCubic).toBeLessThanOrEqual(1);
  });
});

describe("greeting", () => {
  it("is off stage before it starts and at rest after it ends", () => {
    expect(greetingPose(-1).scale).toBe(0);
    expect(greetingPose(GREET.total + 1)).toEqual(REST_POSE);
  });

  it("waves with the right arm, mouth open, during the wave beat", () => {
    const mid = greetingPose((GREET.waveStart + GREET.waveEnd) / 2);
    expect(mid.armRaise).toBeCloseTo(1, 2);
    expect(mid.mouthOpen).toBeGreaterThan(0.9);
    let swings = 0;
    let prev = Math.sign(greetingPose(GREET.waveStart + 0.35).armWave);
    for (let t = GREET.waveStart + 0.35; t < GREET.waveEnd - 0.4; t += 0.02) {
      const s = Math.sign(greetingPose(t).armWave);
      if (s !== 0 && s !== prev) swings++;
      if (s !== 0) prev = s;
    }
    expect(swings).toBeGreaterThanOrEqual(4);
  });

  it("turns all the way round, like the brand video, then faces you", () => {
    expect(greetingPose(GREET.turnStart).turn).toBeCloseTo(0, 3);
    expect(greetingPose(GREET.turnEnd).turn).toBeCloseTo(Math.PI * 2, 3);
    expect(greetingPose(GREET.turnStart + 0.5).lookWeight).toBe(0);
  });

  it("fits in under six seconds", () => {
    expect(GREET.total).toBeLessThan(6);
  });
});

describe("heartbeat, blink, look", () => {
  it("beats lub-dub at 72 bpm, between 0 and 1", () => {
    const period = 60 / 72;
    let peaks = 0;
    let prev = heartbeat(0);
    let rising = false;
    for (let t = 0.001; t < period; t += 0.001) {
      const v = heartbeat(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (rising && v < prev) peaks++;
      rising = v > prev;
      prev = v;
    }
    expect(peaks).toBe(2);
    expect(heartbeat(0.3)).toBeCloseTo(heartbeat(0.3 + period), 6);
  });

  it("blinks briefly and deterministically", () => {
    let closed = 0;
    for (let t = 0; t < 36; t += 0.01) if (blinkAmount(t) > 0.5) closed++;
    expect(closed).toBeGreaterThan(0);
    expect(closed * 0.01).toBeLessThan(36 * 0.1);
    expect(blinkAmount(12.34)).toBe(blinkAmount(12.34));
  });

  it("clamps where he looks so his head never snaps round", () => {
    expect(lookAngles(10, -10)).toEqual({ yaw: 0.6, pitch: -0.32 });
    expect(lookAngles(0, 0)).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe("taps and reactions", () => {
  it("giggles on the head, beats on the belly, cycles elsewhere", () => {
    expect(pickReaction("head", 0)).toBe("giggle");
    expect(pickReaction("belly", 5)).toBe("heart");
    expect([0, 1, 2, 3].map((n) => pickReaction(null, n))).toEqual(["jump", "spin", "wave", "jump"]);
  });

  it("every reaction ends at rest", () => {
    for (const kind of Object.keys(REACTION_S) as (keyof typeof REACTION_S)[]) {
      expect(reactionPose(kind, REACTION_S[kind] + 0.01)).toEqual({});
      expect(reactionPose(kind, -0.01)).toEqual({});
    }
  });

  it("keeps jumps low enough to stay inside the glass", () => {
    let top = 0;
    for (let t = 0; t <= REACTION_S.jump; t += 0.01) top = Math.max(top, reactionPose("jump", t).lift ?? 0);
    expect(top).toBeLessThan(0.35);
  });

  it("spins a full turn and layers over the rest pose", () => {
    expect(reactionPose("spin", REACTION_S.spin).turn).toBeCloseTo(Math.PI * 2, 3);
    const p = layerPose(REST_POSE, { lift: 0.2, turn: 1, armRaise: 0.5 });
    expect(p.lift).toBe(0.2);
    expect(p.turn).toBe(1);
    expect(p.armRaise).toBe(0.5);
    expect(p.scale).toBe(1);
  });

  it("tells a tap from a drag", () => {
    expect(isTap(2, 3, 120)).toBe(true);
    expect(isTap(30, 0, 120)).toBe(false);
    expect(isTap(0, 0, 900)).toBe(false);
  });

  it("springs a drag-spin home to face you", () => {
    let s = { angle: 1.2, velocity: 0 };
    for (let i = 0; i < 400; i++) s = spinStep(s.angle, s.velocity, false, 1 / 60);
    expect(s.angle).toBeCloseTo(0, 2);
    let w = { angle: 5.9, velocity: 0 };
    for (let i = 0; i < 400; i++) w = spinStep(w.angle, w.velocity, false, 1 / 60);
    expect(w.angle).toBeCloseTo(Math.PI * 2, 2);
  });

  it("speaks short lines with no em dashes", () => {
    expect(GREETING_LINE).toBe("Hi, I'm Pulse!");
    for (const lines of Object.values(PULSE_LINES)) {
      for (const l of lines) {
        expect(l).not.toContain("—");
        expect(l.length).toBeLessThan(40);
      }
    }
    expect(lineFor("jump", 3)).toBe(lineFor("jump", 0));
  });

  it("draws the brand ECG: flat, rise, tall spike, deep dip, flat", () => {
    const pts = ecgPoints();
    expect(pts[0]).toEqual({ x: -1, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 1, y: 0 });
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(0.5);
    expect(Math.min(...ys)).toBeLessThan(-0.4);
  });
});

describe("wiring", () => {
  it("puts Pulse in the landing hero, in place of the headline", () => {
    expect(home).toContain("<HeroCrazy mascot />");
    expect(hero).toContain('<h1 className="sr-only">');
    expect(hero).toContain("<PulseBear3D followScroll bleedLeft />");
  });

  it("loads three.js only in the lazy Pulse chunk, never in first paint", () => {
    expect(hero).toContain('dynamic(() => import("./PulseBear3D")');
    expect(hero).toContain("ssr: false");
    expect(hero).not.toContain('from "three"');
    expect(home).not.toContain("three");
    expect(bear).toContain('from "three"');
    expect(scene).toContain('from "three"');
  });

  it("pauses off-screen and on tab-hide, caps DPR, and has a still and a fallback", () => {
    expect(bear).toContain("IntersectionObserver");
    expect(bear).toContain("visibilitychange");
    expect(bear).toContain("prefers-reduced-motion");
    expect(bear).toContain("webglcontextlost");
    expect(bear).toContain("<PulseSprite");
    expect(bear).toContain("renderer.dispose()");
    expect(bear).toMatch(/tier === "full" \? 1\.5 : 1\.25/);
  });

  it("plays the trimmed demo-dashboard loop in the tracker window", () => {
    expect(hero).toContain('src="/landing/demo-pulse-loop.mp4"');
    expect(hero).toContain('poster="/landing/demo-pulse-loop-poster.jpg"');
    expect(hero).toContain("muted");
    expect(hero).toContain("playsInline");
    expect(existsSync(join(repoRoot, "public", "landing", "demo-pulse-loop.mp4"))).toBe(true);
    expect(existsSync(join(repoRoot, "public", "landing", "demo-pulse-loop-poster.jpg"))).toBe(true);
  });

  it("styles the mascot hero only under .hero-mascot, and keeps the classic hero", () => {
    expect(css).toContain(".hero-mascot .hero-crazy-ctas");
    expect(css).toContain(".hero-mascot::before");
    expect(css).toContain(".pulse-bear-canvas");
    expect(hero).toContain('mascot ? "hero-crazy hero-mascot" : "hero-crazy"');
  });

  it("has no preview routes left behind", () => {
    expect(existsSync(join(root, "app", "pulse-preview"))).toBe(false);
  });
});

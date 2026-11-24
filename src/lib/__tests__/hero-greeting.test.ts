import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GREETING_DELAY_MS,
  GREETING_MS,
  GREETING_RESUME_IDLE_MS,
  SCRAMBLE_SENSITIVITY,
  clampGreetingTime,
  crystalFaces,
  crystalLayout,
  crystalVertices,
  ecgRingPoint,
  ecgWave,
  faceNormal,
  faceShade,
  greetParticleAt,
  greetParticleCount,
  greetParticles,
  greetingPhases,
  greetingProgress,
  greetingRotation,
  project,
  rotateX,
  rotateY,
  scrubTimeDelta,
  smoothstep,
} from "@/lib/hero-greeting";

// Hero greeting v3 (landing only, Nov 20 2026): Pulse greets on
// welcome as a crystal assembling from orbiting particles, and after
// the greeting the scene stays live: horizontal pointer movement
// scrubs the greeting timeline, the pointer rotates the scene, touch
// drag scrubs and tap replays. All of it is pure functions of the
// greeting clock, so seeks chain and no frame can drop. (The headline
// that used to scramble in word by word was removed Nov 24 2026,
// with its scramble helpers.)

const root = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");
const hero = read("components/landing/HeroCrazy.tsx");
const css = read("app/globals.css");

describe("greeting clock", () => {
  it("starts in the 800ms welcome delay and runs 2200ms", () => {
    expect(GREETING_DELAY_MS).toBe(800);
    expect(GREETING_MS).toBe(2200);
    expect(greetingProgress(-800)).toBe(0);
    expect(greetingProgress(-1)).toBe(0);
    expect(greetingProgress(0)).toBe(0);
    expect(greetingProgress(1100)).toBeCloseTo(0.5, 5);
    expect(greetingProgress(2200)).toBe(1);
    expect(greetingProgress(9999)).toBe(1);
    expect(clampGreetingTime(-900)).toBe(-800);
    expect(clampGreetingTime(3000)).toBe(2200);
    expect(clampGreetingTime(500)).toBe(500);
  });

  it("runs four overlapping phases in order", () => {
    const start = greetingPhases(0);
    expect(start).toEqual({ assemble: 0, solidify: 0, ring: 0, settle: 0 });
    const mid = greetingPhases(0.45);
    expect(mid.assemble).toBe(1);
    expect(mid.solidify).toBeGreaterThan(0);
    expect(mid.solidify).toBeLessThan(1);
    expect(mid.ring).toBe(0);
    const late = greetingPhases(0.8);
    expect(late.ring).toBe(1);
    expect(late.settle).toBeGreaterThan(0);
    expect(late.settle).toBeLessThan(1);
    expect(greetingPhases(1)).toEqual({ assemble: 1, solidify: 1, ring: 1, settle: 1 });
  });

  it("scrubs delta-based at sensitivity 0.8 across the hero width", () => {
    expect(SCRAMBLE_SENSITIVITY).toBe(0.8);
    expect(scrubTimeDelta(0, 1440)).toBe(0);
    expect(scrubTimeDelta(1440, 1440)).toBeCloseTo(0.8 * GREETING_MS, 5);
    expect(scrubTimeDelta(-720, 1440)).toBeCloseTo(-0.4 * GREETING_MS, 5);
    expect(scrubTimeDelta(100, 0)).toBe(0);
    expect(scrubTimeDelta(100, -50)).toBe(0);
  });

  it("resumes auto-assembly after 2.5s idle", () => {
    expect(GREETING_RESUME_IDLE_MS).toBe(2500);
  });

  it("smoothsteps 0 to 1 between its edges", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 5);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(2, 2, 1)).toBe(0);
    expect(smoothstep(2, 2, 2)).toBe(1);
  });
});

describe("the headline is gone", () => {
  // Nov 24 2026: the hero headline was removed from the DOM, and the
  // scramble helpers went with it. Nothing in the lib or the hero
  // may still scramble words, and no headline CSS may remain.
  it("has no scramble helpers left in the lib", () => {
    const lib = read("lib/hero-greeting.ts");
    for (const name of ["scrambleWord", "scrambleChar", "scrambleTotalMs", "wordScrambleProgress", "SCRAMBLE_CHARSET"]) {
      expect(lib).not.toContain(name);
    }
    expect(lib).not.toContain("SCRAMBLE_WORD_MS");
    expect(lib).not.toContain("SCRAMBLE_WORD_STAGGER_MS");
  });
});

describe("3D math", () => {
  it("rotates around X and Y and back again", () => {
    const v = { x: 0, y: 1, z: 0 };
    const rx = rotateX(v, Math.PI / 2);
    expect(rx.y).toBeCloseTo(0, 5);
    expect(rx.z).toBeCloseTo(1, 5);
    expect(rotateX(rx, -Math.PI / 2)).toEqual({ x: 0, y: 1, z: 0 });
    const ry = rotateY({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    expect(ry.x).toBeCloseTo(0, 5);
    expect(ry.z).toBeCloseTo(-1, 5);
    expect(rotateY(ry, -Math.PI / 2).x).toBeCloseTo(1, 5);
  });

  it("projects with real perspective: near grows, far shrinks", () => {
    const flat = project({ x: 1, y: 1, z: 0 });
    expect(flat.depth).toBeCloseTo(1, 5);
    expect(flat.x).toBeCloseTo(1, 5);
    const near = project({ x: 1, y: 0, z: 1 });
    const far = project({ x: 1, y: 0, z: -1 });
    expect(near.depth).toBeGreaterThan(1);
    expect(far.depth).toBeLessThan(1);
    expect(near.x).toBeGreaterThan(far.x);
    expect(project({ x: 0, y: 0, z: 0 }, 0).depth).toBeCloseTo(1, 5);
  });

  it("builds a stretched octahedron: 6 vertices, 8 faces", () => {
    const verts = crystalVertices();
    expect(verts).toHaveLength(6);
    expect(verts[0]).toEqual({ x: 0, y: 1.7, z: 0 });
    expect(verts[1]).toEqual({ x: 0, y: -1.7, z: 0 });
    const faces = crystalFaces();
    expect(faces).toHaveLength(8);
    for (const [a, b, c] of faces) {
      expect(new Set([a, b, c]).size).toBe(3);
      expect(Math.max(a, b, c)).toBeLessThan(6);
    }
    const top = faceNormal(verts[0], verts[2], verts[3]);
    expect(Math.sqrt(top.x * top.x + top.y * top.y + top.z * top.z)).toBeCloseTo(1, 5);
    expect(faceNormal(verts[0], verts[0], verts[0])).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("shades faces between 0.35 and 1, brightest toward the light", () => {
    const up = faceShade({ x: 0, y: 1, z: 0 });
    const side = faceShade({ x: 1, y: 0, z: 0 });
    const away = faceShade({ x: 0, y: 0, z: -1 });
    for (const s of [up, side, away]) {
      expect(s).toBeGreaterThanOrEqual(0.35);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(up).toBeGreaterThan(side);
    expect(faceShade({ x: 0, y: 1, z: 0 })).toBe(faceShade({ x: 0, y: -1, z: 0 }));
  });
});

describe("greet particles", () => {
  it("is seeded, budgeted per tier, and lands on a vertex", () => {
    expect(greetParticles(7, 12)).toEqual(greetParticles(7, 12));
    expect(greetParticles(7, 12)).toHaveLength(12);
    expect(greetParticleCount("full")).toBe(110);
    expect(greetParticleCount("lite")).toBe(56);
    expect(greetParticleCount("still")).toBe(0);
    const verts = crystalVertices();
    const parts = greetParticles(7, 6);
    for (const p of parts) {
      expect(p.vertex).toBeGreaterThanOrEqual(0);
      expect(p.vertex).toBeLessThan(6);
      const at0 = greetParticleAt(p, 0, 0, verts);
      expect(Math.hypot(at0.x, at0.z)).toBeCloseTo(p.radius, 2);
      const at1 = greetParticleAt(p, 0, 1, verts);
      const target = verts[p.vertex];
      expect(Math.hypot(at1.x - target.x, at1.y - target.y, at1.z - target.z)).toBeLessThan(0.4);
    }
  });

  it("keeps orbiting while assembled, so the crystal shimmers", () => {
    const verts = crystalVertices();
    const [p] = greetParticles(7, 1);
    const a = greetParticleAt(p, 0, 1, verts);
    const b = greetParticleAt(p, 1, 1, verts);
    expect(a.x).not.toBeCloseTo(b.x, 5);
    expect(a).not.toEqual(b);
  });
});

describe("ECG ring", () => {
  it("is flat except for the QRS complex and the T bump", () => {
    expect(ecgWave(0)).toBeCloseTo(0, 5);
    expect(ecgWave(0.55)).toBeCloseTo(0.22, 5);
    expect(ecgWave(0.5)).toBeGreaterThan(0.05);
    expect(ecgWave(0.26)).toBeCloseTo(1, 5);
    expect(ecgWave(0.33)).toBeLessThan(-0.2);
    expect(ecgWave(0.7)).toBeCloseTo(0, 5);
    expect(ecgWave(1.26)).toBeCloseTo(ecgWave(0.26), 5);
  });

  it("wraps a circle whose radius spikes with the wave", () => {
    const at0 = ecgRingPoint(0, 2.3);
    expect(Math.hypot(at0.x, at0.z)).toBeCloseTo(2.3, 5);
    const spike = ecgRingPoint(0.26, 2.3);
    expect(Math.hypot(spike.x, spike.z)).toBeGreaterThan(2.6);
    const dip = ecgRingPoint(0.33, 2.3);
    expect(Math.hypot(dip.x, dip.z)).toBeLessThan(2.3);
    expect(ecgRingPoint(0, 2.3).y).toBe(0);
  });
});

describe("scene orientation and layout", () => {
  it("turns with the greeting, leans with the pointer, and idles after", () => {
    const rest = greetingRotation(0, 0.5, 0.5, 0);
    expect(rest.rotY).toBeCloseTo(-0.9, 5);
    expect(rest.rotX).toBeCloseTo(0.16, 5);
    const done = greetingRotation(1, 0.5, 0.5, 0);
    expect(done.rotY).toBeCloseTo(0.5, 5);
    const leaned = greetingRotation(1, 1, 0, 0);
    expect(leaned.rotY).toBeGreaterThan(done.rotY);
    expect(leaned.rotX).toBeLessThan(done.rotX);
    const spun = greetingRotation(1, 0.5, 0.5, 10);
    expect(spun.rotY).toBeCloseTo(0.5 + 1.2, 5);
    const unassembled = greetingRotation(0, 0.5, 0.5, 10);
    expect(unassembled.rotY).toBeCloseTo(-0.9, 5);
  });

  it("puts the crystal upper-right on desktop, top-right corner on phones", () => {
    const desk = crystalLayout(1440, 900);
    expect(desk.cx).toBeCloseTo(1440 * 0.78, 5);
    expect(desk.cy).toBeCloseTo(900 * 0.24, 5);
    expect(desk.radius).toBeGreaterThanOrEqual(120);
    expect(desk.radius).toBeLessThanOrEqual(200);
    expect(desk.alpha).toBeCloseTo(0.95, 5);
    const phone = crystalLayout(390, 844);
    expect(phone.cx).toBeCloseTo(390 * 0.84, 5);
    expect(phone.cy).toBe(92);
    expect(phone.radius).toBeGreaterThanOrEqual(54);
    expect(phone.radius).toBeLessThanOrEqual(84);
    expect(phone.alpha).toBeCloseTo(0.85, 5);
    const tiny = crystalLayout(320, 700);
    expect(tiny.radius).toBeGreaterThanOrEqual(54);
    expect(crystalLayout(0, 0)).toEqual({ cx: 0, cy: 0, radius: 0, alpha: 0 });
    expect(crystalLayout(821, 800).cx).toBeCloseTo(821 * 0.78, 5);
  });
});

describe("greeting component wiring", () => {
  it("draws the crystal on the hero canvas, scrubs on pointer", () => {
    expect(hero).toContain("hero-greeting");
    expect(hero).toContain("greetingProgress");
    expect(hero).toContain("scrubTimeDelta");
    expect(hero).toContain("crystalLayout");
    expect(hero).toContain("ecgRingPoint");
    expect(hero).toContain("greetParticleAt");
    expect(hero).toContain("GREETING_DELAY_MS");
    expect(hero).toContain("GREETING_RESUME_IDLE_MS");
    expect(hero).toContain("pointerdown");
    expect(hero).toContain("pointerup");
    expect(hero).not.toContain("from \"three\"");
    expect(hero).not.toContain("@react-three");
    expect(hero).not.toContain("—");
  });

  it("carries no headline reveal CSS: the headline is gone", () => {
    expect(css).not.toContain(".hero-crazy-copy h1");
    expect(css).not.toContain(".hw-in");
    expect(css).not.toContain("h1.in .hw-in");
    expect(css).not.toContain("translateY(112%)");
    expect(css).toContain(".hero-crazy-copy > p");
  });
});

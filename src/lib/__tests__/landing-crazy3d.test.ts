import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOOP_MS, morphStates, stateAt } from "@/lib/hero-morph";
import {
  damp,
  deviceTier,
  dprCap,
  heroScrollFrame,
  particleAt,
  particleCount,
  particleField,
  revealTotalMs,
  tiltFromPointer,
  wordDelay,
} from "@/lib/hero-crazy";

// Hero crazy-3D (landing only, Nov 20 2026; the Resume check was
// removed Nov 22 2026): the glass
// morph lives on inside a full-viewport hero with a canvas particle
// field, a Clash Display word-by-word reveal, pointer tilt, and a
// scroll morph into About. The dashboard is untouched: no dashboard
// imports, no glow on signed-in pages, no new npm dependencies.

const root = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const home = read("app/page.tsx");
const hero = read("components/landing/HeroCrazy.tsx");
const about = read("components/landing/AboutLanding.tsx");
const morph = read("lib/hero-morph.ts");
const crazy = read("lib/hero-crazy.ts");
const css = read("app/globals.css");

describe("hero morph timing is a pure function of loop time", () => {
  it("loops every 8 seconds across three states", () => {
    expect(LOOP_MS).toBe(8000);
    expect(stateAt(0).index).toBe(0);
    expect(stateAt(2667).index).toBe(1);
    expect(stateAt(5334).index).toBe(2);
    expect(stateAt(8000).index).toBe(0);
    expect(stateAt(8000).progress).toBeCloseTo(0, 5);
  });

  it("travels in fast, holds, then travels out at the end of each slot", () => {
    expect(stateAt(0).enter).toBe(0);
    expect(stateAt(500).enter).toBe(1);
    expect(stateAt(1500).enter).toBe(1);
    expect(stateAt(1500).exit).toBe(0);
    expect(stateAt(2666).exit).toBeCloseTo(1, 2);
  });

  it("counts come from the demo tracker, never hard-coded", () => {
    const states = morphStates();
    expect(states).toHaveLength(3);
    expect(states[0]).toEqual({ value: 22, label: "Applications tracked", sub: "Every stage, one dashboard" });
    expect(states[1].value).toBe(6);
    expect(states[1].label).toBe("Assessments received");
    expect(states[2].value).toBe(5);
    expect(states[2].label).toBe("Interviews lined up");
  });
});

describe("hero crazy-3D component", () => {
  it("runs one rAF loop gated on fonts, with a reduced-motion still frame", () => {
    expect(hero).toContain("requestAnimationFrame");
    expect(hero).toContain("document.fonts");
    expect(hero).toContain("prefers-reduced-motion");
    expect(hero).toContain("cancelAnimationFrame");
    expect(hero).toContain("visibilitychange");
  });

  it("builds the glass shell from layers, with a 1.5px gradient rim", () => {
    for (const layer of ["morph-halo", "morph-base", "morph-glow", "morph-sheen", "morph-grain", "morph-rim"]) {
      expect(hero).toContain(layer);
      expect(css).toContain(`.${layer}`);
    }
    expect(css).toContain("padding: 1.5px");
    expect(css).toContain("mask-composite: exclude");
  });

  it("keeps the red accent on near-black, with a canvas field and Clash Display", () => {
    expect(hero).toContain("hero-field");
    expect(hero).toContain("hero-aurora");
    expect(hero).toContain("clash-display");
    expect(hero).toContain("api.fontshare.com");
    expect(css).toContain("#fd585d");
    expect(css).toContain("#0d0c10");
    expect(css).toContain('"Clash Display"');
  });

  it("keeps the CTAs flat and has no em dashes in the new hero copy", () => {
    expect(hero).toContain("Start your tracker");
    expect(hero).toContain("Self-host");
    expect(hero).toContain("Connect your agent");
    expect(hero).not.toContain("—");
  });
});

describe("crazy hero math is pure functions", () => {
  it("tilts toward the pointer, capped, centered at zero", () => {
    expect(tiltFromPointer(0.5, 0.5, 1, 1)).toEqual({ rotateX: -0, rotateY: 0 });
    const tl = tiltFromPointer(0, 0, 1, 1);
    expect(tl.rotateY).toBe(-10);
    expect(tl.rotateX).toBe(10);
    const br = tiltFromPointer(2, 2, 1, 1);
    expect(br.rotateY).toBe(10);
    expect(br.rotateX).toBe(-10);
    expect(tiltFromPointer(0.5, 0.5, 0, 0)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("damps toward the target without overshooting", () => {
    expect(damp(0, 10, 6, 0)).toBe(0);
    const mid = damp(0, 10, 6, 0.1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);
    expect(damp(10, 10, 6, 1)).toBe(10);
  });

  it("scrolls the hero away and back, purely", () => {
    const rest = heroScrollFrame(0, 800);
    expect(rest.cardRotateX).toBe(0);
    expect(rest.cardScale).toBe(1);
    expect(rest.cardOpacity).toBe(1);
    expect(rest.copyOpacity).toBe(1);
    const gone = heroScrollFrame(800, 800);
    expect(gone.cardRotateX).toBeCloseTo(18, 5);
    expect(gone.cardScale).toBeCloseTo(0.88, 5);
    expect(gone.cardOpacity).toBeCloseTo(0.15, 5);
    expect(gone.copyOpacity).toBe(0);
    expect(gone.fieldY).toBe(160);
    expect(heroScrollFrame(400, 800)).toEqual(heroScrollFrame(400, 800));
  });

  it("tiers weak devices down and caps DPR at 2", () => {
    expect(deviceTier({ reducedMotion: true })).toBe("still");
    expect(deviceTier({ saveData: true })).toBe("lite");
    expect(deviceTier({ deviceMemory: 4 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 2 })).toBe("lite");
    expect(deviceTier({ width: 390 })).toBe("lite");
    expect(deviceTier({ deviceMemory: 8, hardwareConcurrency: 8, width: 1440 })).toBe("full");
    expect(particleCount("full")).toBe(140);
    expect(particleCount("lite")).toBe(48);
    expect(particleCount("still")).toBe(0);
    expect(dprCap("full")).toBe(2);
    expect(dprCap("lite")).toBe(1);
  });

  it("grows a deterministic particle field that wraps in time", () => {
    const a = particleField(42, 10);
    const b = particleField(42, 10);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    expect(a.every((p) => p.x >= 0 && p.x < 1 && p.y >= 0 && p.y < 1)).toBe(true);
    const p = a[0];
    const at0 = particleAt(p, 0);
    expect(Math.abs(at0.x - p.x)).toBeLessThan(0.01);
    expect(at0.y).toBeCloseTo(p.y, 5);
    const later = particleAt(p, 100);
    expect(later.x).toBeGreaterThanOrEqual(0);
    expect(later.x).toBeLessThan(1);
    expect(later.y).toBeGreaterThanOrEqual(0);
    expect(later.y).toBeLessThan(1);
  });

  it("reveals the headline word by word, under the 3 second cap", () => {
    expect(wordDelay(0)).toBeCloseTo(0.15, 5);
    expect(wordDelay(1)).toBeCloseTo(0.24, 5);
    expect(wordDelay(5)).toBeCloseTo(0.6, 5);
    expect(revealTotalMs(6)).toBeLessThan(3000);
    expect(revealTotalMs(6)).toBe(1400);
    expect(revealTotalMs(0)).toBe(0);
  });
});

describe("landing wiring", () => {
  it("renders the crazy hero first, then install and About, with no resume check", () => {
    expect(home).toContain("<HeroCrazy");
    expect(home).not.toContain("<HeroMorph />");
    expect(home).not.toContain("ResumeSection");
    expect(home).not.toContain("#resume");
    expect(home.indexOf("<HeroCrazy")).toBeLessThan(home.indexOf("<InstallSection />"));
    expect(home.indexOf("<InstallSection />")).toBeLessThan(home.indexOf("<AboutLanding />"));
  });

  it("keeps the hero, morph, and About 3D styles in globals.css, and drops the resume styles", () => {
    expect(css).not.toContain(".resume-check");
    for (const name of [".hero-crazy", ".hero-field", ".hero-aurora", ".morph-card", ".morph-num", ".about-3d", ".reveal-3d"]) {
      expect(css).toContain(name);
    }
  });

  it("touches no dashboard code and adds no new dependencies", () => {
    for (const src of [home, hero, crazy, morph]) {
      expect(src).not.toContain("components/dashboard");
    }
    expect(home).not.toContain("Dashboard");
    expect(hero).not.toContain('from "three"');
    expect(hero).not.toContain("@react-three");
  });
});

describe("About 3D layer", () => {
  it("adds the open-source card with verified claims, no em dashes in the new copy", () => {
    expect(about).toContain("Open source, self-host it");
    expect(about).toContain("MIT licensed and free to run yourself");
    expect(about).toContain("One Deploy button");
    expect(about).toContain("https://github.com/kumailrizvi890/Pulse-Find");
    expect(about).toContain("reveal-3d");
    expect(about).toContain("founder-photo-3d");
  });

  it("counts the founder numbers up from their rendered values, reduced-motion safe", () => {
    expect(about).toContain("prefers-reduced-motion");
    expect(about).toContain("founder-nums b");
    expect(about).toContain("requestAnimationFrame");
    expect(about).toContain("<b>243</b>");
    expect(about).toContain("<b>{TEST_COUNT}</b>");
    expect(about).toContain("<b>6</b>");
  });
});

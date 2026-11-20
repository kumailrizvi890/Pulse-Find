import { describe, expect, it } from "vitest";
import {
  auroraShift,
  countUpValue,
  easeOutBack,
  easeOutCubic,
  ecgOffset,
  parallaxOffset,
  scrollProgressLine,
  sectionProgress,
  springStep,
  staggerDelay,
} from "@/lib/scroll-anim";

// Scroll animation math (landing only, Nov 20 2026): every function
// in scroll-anim.ts is pure, so this file covers them all without a
// DOM. No em dashes anywhere in this file.

describe("sectionProgress", () => {
  it("is 0 when the element first touches the viewport bottom", () => {
    expect(sectionProgress(0, 800, 400, 800)).toBe(0);
  });

  it("is 1 when the element has fully left the viewport top", () => {
    expect(sectionProgress(1200, 0, 400, 800)).toBe(1);
  });

  it("is about 0.5 when the element is centred in view", () => {
    const p = sectionProgress(0, 200, 400, 800);
    expect(p).toBeCloseTo(0.5, 5);
  });

  it("clamps below 0 and above 1", () => {
    expect(sectionProgress(-500, 800, 400, 800)).toBe(0);
    expect(sectionProgress(5000, 0, 400, 800)).toBe(1);
  });

  it("returns 0 for a zero viewport or a zero height element", () => {
    expect(sectionProgress(0, 0, 400, 0)).toBe(0);
    expect(sectionProgress(0, 0, 0, 800)).toBe(0);
  });
});

describe("easeOutBack", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBe(1);
  });

  it("overshoots past 1 mid-flight, then settles", () => {
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
    expect(easeOutBack(0.7)).toBeLessThan(1.11);
    expect(easeOutBack(0.5)).toBeGreaterThan(0.5);
  });

  it("never goes below 0 or wild above the overshoot bound", () => {
    for (let i = 0; i <= 20; i++) {
      const v = easeOutBack(i / 20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.11);
    }
  });

  it("clamps its input", () => {
    expect(easeOutBack(-1)).toBe(0);
    expect(easeOutBack(2)).toBe(1);
  });
});

describe("easeOutCubic", () => {
  it("starts at 0, ends at 1, and passes the midpoint early", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });
});

describe("parallaxOffset", () => {
  it("runs from -maxPx through 0 to +maxPx", () => {
    expect(parallaxOffset(0, 24)).toBe(-24);
    expect(parallaxOffset(0.5, 24)).toBe(0);
    expect(parallaxOffset(1, 24)).toBe(24);
  });

  it("clamps progress outside 0 to 1", () => {
    expect(parallaxOffset(-1, 24)).toBe(-24);
    expect(parallaxOffset(2, 24)).toBe(24);
  });
});

describe("countUpValue", () => {
  it("starts at 0 and lands exactly on final", () => {
    expect(countUpValue(243, 0, 1000)).toBe(0);
    expect(countUpValue(243, 1000, 1000)).toBe(243);
  });

  it("eases out, so the midpoint is past half", () => {
    expect(countUpValue(200, 500, 1000)).toBeGreaterThan(100);
    expect(countUpValue(200, 500, 1000)).toBe(175);
  });

  it("stays at final past the duration and with a zero duration", () => {
    expect(countUpValue(1071, 5000, 1000)).toBe(1071);
    expect(countUpValue(1071, 0, 0)).toBe(1071);
  });
});

describe("scrollProgressLine", () => {
  it("maps progress 0 to 1 onto a 0 to 100 fill", () => {
    expect(scrollProgressLine(0)).toBe(0);
    expect(scrollProgressLine(0.5)).toBe(50);
    expect(scrollProgressLine(1)).toBe(100);
  });

  it("clamps outside 0 to 1", () => {
    expect(scrollProgressLine(-0.5)).toBe(0);
    expect(scrollProgressLine(1.5)).toBe(100);
  });
});

describe("ecgOffset", () => {
  it("leaves the full path hidden at the top and drawn at the bottom", () => {
    expect(ecgOffset(0, 100)).toBe(100);
    expect(ecgOffset(1, 100)).toBe(0);
    expect(ecgOffset(0.5, 100)).toBe(50);
  });

  it("clamps progress and never goes negative on length", () => {
    expect(ecgOffset(-1, 100)).toBe(100);
    expect(ecgOffset(2, 100)).toBe(0);
    expect(ecgOffset(0.5, -40)).toBe(0);
  });
});

describe("auroraShift", () => {
  it("is still at rest", () => {
    expect(auroraShift(0)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("drifts left and up and grows slightly at full scroll", () => {
    expect(auroraShift(1)).toEqual({ x: -3, y: 4, scale: 1.05 });
  });

  it("is halfway there at half scroll and clamps outside", () => {
    expect(auroraShift(0.5)).toEqual({ x: -1.5, y: 2, scale: 1.025 });
    expect(auroraShift(2)).toEqual(auroraShift(1));
    expect(auroraShift(-1)).toEqual(auroraShift(0));
  });
});

describe("staggerDelay", () => {
  it("starts at the base and steps per index", () => {
    expect(staggerDelay(0, 80, 80, 400)).toBe(80);
    expect(staggerDelay(2, 80, 80, 400)).toBe(240);
  });

  it("caps at the cap and treats a negative index as the first item", () => {
    expect(staggerDelay(10, 80, 80, 400)).toBe(400);
    expect(staggerDelay(-2, 80, 80, 400)).toBe(80);
  });
});

describe("springStep", () => {
  it("stays put when already on target with no velocity", () => {
    expect(springStep(10, 0, 10, 120, 14, 1 / 60)).toEqual({ value: 10, velocity: 0 });
  });

  it("does not move when dt is 0", () => {
    expect(springStep(0, 5, 10, 120, 14, 0)).toEqual({ value: 0, velocity: 5 });
  });

  it("overshoots with light damping, like a weighted tilt", () => {
    let s = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 120; i++) {
      s = springStep(s.value, s.velocity, 10, 120, 4, 1 / 60);
      max = Math.max(max, s.value);
    }
    expect(max).toBeGreaterThan(10);
  });

  it("settles on target with the hero damping", () => {
    let s = { value: 0, velocity: 0 };
    for (let i = 0; i < 240; i++) {
      s = springStep(s.value, s.velocity, 10, 120, 14, 1 / 60);
    }
    expect(s.value).toBeCloseTo(10, 1);
    expect(Math.abs(s.velocity)).toBeLessThan(0.5);
  });

  it("moves toward the target on the first step", () => {
    const s = springStep(0, 0, 10, 120, 14, 1 / 60);
    expect(s.value).toBeGreaterThan(0);
    expect(s.value).toBeLessThan(10);
    expect(s.velocity).toBeGreaterThan(0);
  });
});

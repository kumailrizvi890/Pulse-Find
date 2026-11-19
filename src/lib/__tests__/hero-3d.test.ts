import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The old hero's pulse line used to sit in a div BELOW the hero
// section, and the section itself was taller than the viewport, so on
// load the line was cropped at the bottom edge. That hero is gone
// (Nov 19 2026: the landing is the About page now) — the pulse line
// survives in the sticky top bar, and the textured 3D backdrop, the
// beating trace, and the auth-page treatment are unchanged. The
// viewport-fit pins below now guard the removal: no hero section, no
// HeroBackdrop on the landing. The backdrop/heartbeat pins guard the
// surviving components so they cannot silently regress.

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const home = read("app/page.tsx");
const css = read("app/globals.css");
const trace = read("components/PulseTrace.tsx");
const backdrop = read("components/HeroBackdrop.tsx");
const newCss = css.slice(css.indexOf("HERO 3D + HEARTBEAT"), css.indexOf("SITE-WIDE TEXTURED 3D BACKGROUND"));

describe("the old hero is gone; the pulse line lives in the top bar", () => {
  it("the landing has no viewport-height hero section anymore", () => {
    expect(home).not.toContain("min-h-[calc(100dvh-69px)]");
    expect(home).not.toContain("<HeroBackdrop />");
    expect(home).not.toContain("HeroBackdrop");
    expect(home).not.toContain("<HeroPreview />");
  });

  it("the pulse line still shows on the landing, in the sticky header", () => {
    const topBar = read("components/TopBar.tsx");
    expect(topBar).toContain('<PulseTrace className="block h-[12px] w-full" glow />');
    expect(home).toContain("<TopBar");
  });
});

describe("hero 3D backdrop", () => {
  it("the landing renders no hero backdrop of its own", () => {
    // The site-wide SiteBackdrop in the root layout is the only
    // backdrop now (see site-texture.test.ts); the hero's own
    // backdrop component stays in the repo unused, flagged for
    // cleanup with the other old landing components.
    expect(home).not.toContain("HeroBackdrop");
    expect(home).not.toContain('<div className="relative min-w-0">');
  });

  it("the backdrop has three depth layers, grain and a vignette", () => {
    expect(backdrop).toContain('data-depth="10"');
    expect(backdrop).toContain('data-depth="18"');
    expect(backdrop).toContain('data-depth="26"');
    expect(backdrop).toContain("pf-hero-glow-far");
    expect(backdrop).toContain("pf-hero-glow-mid");
    expect(backdrop).toContain("pf-hero-glow-near");
    expect(backdrop).toContain("pf-hero-grain");
    expect(backdrop).toContain("pf-hero-vignette");
    expect(backdrop).toContain("pf-hero-drift");
    expect(backdrop).toContain("pointer-events-none");
    expect(backdrop).toContain("aria-hidden");
  });

  it("the parallax is rAF-throttled, transform-only, and stops off-screen", () => {
    expect(backdrop).toContain("requestAnimationFrame");
    expect(backdrop).toContain("pointermove");
    expect(backdrop).toContain("translate3d");
    expect(backdrop).toContain("window.scrollY > window.innerHeight");
    expect(backdrop).toContain("matchMedia");
    expect(backdrop).toContain("prefers-reduced-motion: reduce");
  });

  // Scoped to the hero section: the site-wide texture section below
  // deliberately adds the preview's violet-tinted edge glows (approved
  // Nov 16 2026) — that exception lives in the site section only.
  it("the backdrop CSS uses the existing red only, no new colors", () => {
    expect(newCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const rgbs = [...newCss.matchAll(/rgb\((\d+ \d+ \d+)/g)].map((m) => m[1]);
    expect(rgbs.length).toBeGreaterThan(0);
    for (const rgb of rgbs) {
      expect(["253 88 93", "248 52 62", "13 12 16"]).toContain(rgb);
    }
  });
});

describe("heartbeat animation", () => {
  it("the trace draws itself on load and carries a travelling head", () => {
    expect(trace).toContain('className="pulse-trace"');
    expect(trace).toContain('className="pf-ecg-head"');
    expect(trace).toContain('className="pf-ecg-halo"');
    // The head is the same path as the line, so it travels exactly on it:
    // the halo (2), the base core and the head all render d={d}.
    expect(trace.match(/d=\{d\}/g)?.length).toBe(4);
  });

  it("the beat is a double beat on a slow loop, with the design easing", () => {
    expect(css).toContain("@keyframes pf-ecg-beat");
    expect(css).toContain(".pf-ecg-head");
    expect(css).toContain("stroke-dasharray: 26 94;");
    expect(css).toContain("2.6s cubic-bezier(0.22, 1, 0.36, 1)");
    expect(css).toContain("@keyframes pf-ecg-thump");
    expect(css).toContain(".pf-ecg-halo");
    // Two bursts with a pause between them: the offset holds, travels,
    // holds, travels, holds, then fades and resets invisibly.
    const beat = css.slice(css.indexOf("@keyframes pf-ecg-beat"), css.indexOf(".pf-ecg-head"));
    expect(beat).toContain("stroke-dashoffset: 120;");
    expect(beat).toContain("stroke-dashoffset: 82;");
    expect(beat).toContain("stroke-dashoffset: 26;");
  });

  it("reduced motion shows the full line still and hides the head", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {", css.indexOf("HERO 3D")));
    expect(reduced).toContain(".pulse-trace { animation: none; }");
    expect(reduced).toContain(".pf-ecg-head { display: none; }");
    expect(reduced).toContain(".pf-ecg-halo { animation: none; }");
    expect(reduced).toContain(".pf-hero-drift { animation: none; }");
  });
});

describe("the treatment follows through to the auth pages", () => {
  it("sign-in renders the shared backdrop and the pulse line", () => {
    const login = read("app/login/page.tsx");
    expect(login).toContain('import { HeroBackdrop } from "@/components/HeroBackdrop";');
    expect(login).toContain("<HeroBackdrop />");
    expect(login).toContain("<PulseTrace");
  });

  it("sign-up, forgot-password and reset-password render it too", () => {
    for (const f of ["app/signup/page.tsx", "app/forgot-password/page.tsx", "app/auth/reset-password/page.tsx"]) {
      const src = read(f);
      expect(src).toContain("<HeroBackdrop />");
      expect(src).toContain("<PulseTrace");
      expect(src).toContain("relative min-h-dvh overflow-hidden");
    }
  });
});

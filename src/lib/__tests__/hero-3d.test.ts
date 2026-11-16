import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The hero's pulse line used to sit in a div BELOW the hero section, and
// the section itself was taller than the viewport (pt-20 + content +
// pb-16), so on load the line was cropped at the bottom edge and you had
// to scroll to see it whole. The section is now exactly viewport height
// (the sticky header's 69px accounted for), the line lives inside it as
// the last grid row, and lg:content-between pins it to the bottom edge.
// The hero also gets a textured 3D backdrop, and the line now beats:
// a glowing head travels it in a double beat (lub-dub) on a slow loop,
// with the halo thumping in time. Same treatment on the auth pages.
// Pin all of it so it cannot silently regress.

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const home = read("app/page.tsx");
const css = read("app/globals.css");
const trace = read("components/PulseTrace.tsx");
const backdrop = read("components/HeroBackdrop.tsx");
const newCss = css.slice(css.indexOf("HERO 3D + HEARTBEAT"), css.indexOf("SITE-WIDE TEXTURED 3D BACKGROUND"));

describe("hero pulse line fits the viewport on load", () => {
  it("the hero section is viewport height minus the sticky header", () => {
    // Header is 69px tall (12px trace + 56px nav + 1px border), measured.
    expect(home).toContain("min-h-[calc(100dvh-69px)]");
  });

  it("the pulse line lives inside the hero section as the last grid row", () => {
    const sectionStart = home.indexOf("<section");
    const sectionEnd = home.indexOf("</section>");
    const section = home.slice(sectionStart, sectionEnd);
    expect(section).toContain('<PulseTrace className="h-10 w-full" />');
    expect(section).toContain('lg:col-span-2');
    // The old standalone div below the section is gone.
    expect(home).not.toContain('className="gutter mx-auto w-full max-w-[1180px] pb-4"');
  });

  it("the free space goes between the content and the line on wide screens", () => {
    expect(home).toContain("lg:content-between");
  });
});

describe("hero 3D backdrop", () => {
  it("the hero renders the shared backdrop behind the content", () => {
    expect(home).toContain('import { HeroBackdrop } from "@/components/HeroBackdrop";');
    expect(home).toContain("<HeroBackdrop />");
    const sectionStart = home.indexOf("<section");
    expect(home.indexOf("<HeroBackdrop />")).toBeGreaterThan(sectionStart);
    expect(home.indexOf("<HeroBackdrop />")).toBeLessThan(home.indexOf("</section>"));
    // Content paints above the backdrop: the column and the trace row
    // are positioned, the preview already is.
    expect(home).toContain('<div className="relative min-w-0">');
    expect(home).toContain('<div className="relative lg:col-span-2"');
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

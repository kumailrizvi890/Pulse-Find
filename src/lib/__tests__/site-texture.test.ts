import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Site-wide textured 3D background (Nov 16 2026): the dark textured
// look Kumail approved in the preview, carried across the whole site
// so it stops reading as plain black. One fixed layer (SiteBackdrop,
// mounted in the root layout) holds the depth glows, the perspective
// grid floor, the floating shards/rings, the dot grid and the grain;
// the body carries faint base gradients and the surface colors go
// translucent glass so cards lift off the texture. The hero keeps its
// own local depth (HeroBackdrop, untouched) — this extends it, it
// does not replace it. Pin all of it so it cannot silently regress.

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const layout = read("app/layout.tsx");
const css = read("app/globals.css");
const backdrop = read("components/SiteBackdrop.tsx");
const home = read("app/page.tsx");
const siteCss = css.slice(css.indexOf("SITE-WIDE TEXTURED 3D BACKGROUND"));

describe("site backdrop is mounted once, in the root layout", () => {
  it("the root layout imports and renders SiteBackdrop before the page", () => {
    expect(layout).toContain('import { SiteBackdrop } from "@/components/SiteBackdrop";');
    expect(layout).toContain("<SiteBackdrop />");
    expect(layout.indexOf("<SiteBackdrop />")).toBeLessThan(layout.indexOf("{children}"));
  });

  it("no page mounts its own copy — the layout is the single mount point", () => {
    for (const p of ["app/page.tsx", "app/login/page.tsx", "app/demo/page.tsx", "app/app/page.tsx"]) {
      expect(read(p)).not.toContain("SiteBackdrop");
    }
  });
});

describe("site backdrop layer", () => {
  it("is a fixed, behind-everything, non-interactive layer", () => {
    expect(backdrop).toContain("fixed inset-0 -z-10");
    expect(backdrop).toContain("pointer-events-none");
    expect(backdrop).toContain("overflow-hidden");
    expect(backdrop).toContain("aria-hidden");
  });

  it("has depth layers with the hero's parallax steps, plus violet edge glows from the preview", () => {
    expect(backdrop).toContain('data-depth="10"');
    expect(backdrop).toContain('data-depth="18"');
    expect(backdrop).toContain('data-depth="26"');
    expect(backdrop).toContain("pf-site-glow-far");
    expect(backdrop).toContain("pf-site-glow-near");
    expect(backdrop).toContain("pf-site-glow-violet");
  });

  it("has the perspective grid floor, floating shards and rings, dots and grain", () => {
    expect(backdrop).toContain("pf-site-floor");
    expect(backdrop).toContain("pf-site-shard");
    expect(backdrop).toContain("pf-site-ring");
    expect(backdrop).toContain("pf-site-float-a");
    expect(backdrop).toContain("pf-site-float-b");
    expect(backdrop).toContain("pf-site-float-c");
    expect(backdrop).toContain("pf-site-dots");
    expect(backdrop).toContain("pf-hero-grain");
    expect(backdrop).toContain("pf-hero-vignette");
  });

  it("parallax is rAF-throttled, transform-only, and skipped under reduced motion", () => {
    expect(backdrop).toContain("requestAnimationFrame");
    expect(backdrop).toContain("pointermove");
    expect(backdrop).toContain("translate3d");
    expect(backdrop).toContain("matchMedia");
    expect(backdrop).toContain("prefers-reduced-motion: reduce");
  });

  it("has no scroll guard — the layer is viewport-fixed, so it never scrolls away", () => {
    expect(backdrop).not.toContain("window.scrollY");
  });
});

describe("site texture styles", () => {
  it("the body carries faint red and violet base gradients over the charcoal", () => {
    expect(siteCss).toContain("radial-gradient(900px 520px at 85% -10%, rgb(253 88 93 / 0.07)");
    expect(siteCss).toContain("radial-gradient(760px 480px at -10% 95%, rgb(139 92 246 / 0.06)");
  });

  it("surface colors go translucent glass with a top highlight", () => {
    expect(siteCss).toContain("color-mix(in srgb, var(--surface) 86%, transparent)");
    expect(siteCss).toContain("color-mix(in srgb, var(--surface-2) 86%, transparent)");
    expect(siteCss).toContain("inset 0 1px 0 rgb(255 255 255 / 0.06)");
  });

  it("the shell lets the backdrop show through instead of painting opaque black", () => {
    const shellStart = css.indexOf(".pf-shell {");
    const shell = css.slice(shellStart, css.indexOf("}", shellStart));
    expect(shell).toContain("transparent");
    expect(shell).not.toContain("var(--bg)");
  });

  it("the violet tint lives only in the site section — nowhere else in the stylesheet", () => {
    const violet = "139 92 246";
    const inSite = siteCss.split(violet).length - 1;
    const inAll = css.split(violet).length - 1;
    expect(inSite).toBeGreaterThan(0);
    expect(inAll).toBe(inSite);
  });

  it("the grid floor is a tilted perspective grid that fades with distance", () => {
    expect(siteCss).toContain("perspective(520px) rotateX(62deg)");
    expect(siteCss).toContain("mask-image: linear-gradient(to top, black 20%, transparent 88%)");
  });

  it("the floats are slow loops, switched off outright under reduced motion", () => {
    expect(siteCss).toContain("@keyframes pf-site-float");
    expect(siteCss).toContain(".pf-site-float-a { animation: pf-site-float 11s");
    expect(siteCss).toContain(".pf-site-float-b { animation: pf-site-float 14s");
    expect(siteCss).toContain(".pf-site-float-c { animation: pf-site-float 9s");
    const reduced = siteCss.slice(siteCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".pf-site-float-a, .pf-site-float-b, .pf-site-float-c { animation: none; }");
  });
});

describe("jobs surfaces get the same background", () => {
  it("the jobs board has no opaque page wrapper — the site backdrop shows through", () => {
    const board = read("app/jobs/JobsBoard.tsx");
    expect(board).toContain('<main className="gutter rise mx-auto flex w-full max-w-[1180px] flex-col gap-5 pb-20 pt-8">');
  });

  it("the jobs filter panel, saved panel and swipe cards are glass surfaces", () => {
    const board = read("app/jobs/JobsBoard.tsx");
    expect(board).toContain('rounded-2xl border border-line bg-surface p-3 shadow-panel');
    expect(board).toContain('rounded-2xl border border-line bg-surface p-4 shadow-panel');
    const deck = read("app/jobs/SwipeDeck.tsx");
    expect(deck).toContain("absolute inset-0 flex flex-col items-center rounded-3xl border border-line bg-surface p-6 text-center shadow-panel");
  });

  it("the swipe-card glow stays on the wrapper div, never on the overflow-hidden deck container", () => {
    const deck = read("app/jobs/SwipeDeck.tsx");
    expect(deck).toContain('className={cx("w-full rounded-3xl border border-transparent"');
    const container = 'className="relative h-[400px] w-full select-none overflow-hidden"';
    expect(deck).toContain(container);
    expect(deck.indexOf("pf-glow")).toBeLessThan(deck.indexOf(container));
    const containerStart = deck.indexOf(container);
    expect(deck.slice(containerStart, containerStart + 80)).not.toContain("pf-glow");
  });

  it("the new landing has no job-finder list: jobs live at /jobs", () => {
    // Nov 19 2026: the old landing's job-finder section (live count +
    // glass list) went away with the hero. Visitors reach jobs from
    // the nav, on the shared /jobs page over the same backdrop.
    expect(home).not.toContain("divide-y divide-line rounded-2xl border border-line bg-surface px-4 shadow-panel");
    expect(home).not.toContain("tech internships open right now");
    expect(home).toContain('href="/jobs"');
  });

  it("demo visitors reach jobs through the shared /jobs page — there is no separate demo jobs route to leave flat", () => {
    const nav = read("app/demo/DemoNav.tsx");
    expect(nav).toContain('href="/jobs"');
  });
});

describe("the old hero is gone; the site backdrop is the only one", () => {
  it("the landing mounts no hero backdrop of its own", () => {
    expect(home).not.toContain("HeroBackdrop");
    expect(home).not.toContain("min-h-[calc(100dvh-69px)]");
  });

  it("HeroBackdrop itself is unchanged — no site-layer code leaked into it", () => {
    const hero = read("components/HeroBackdrop.tsx");
    expect(hero).not.toContain("SiteBackdrop");
    expect(hero).not.toContain("pf-site-");
    expect(hero).toContain("window.scrollY > window.innerHeight");
  });
});

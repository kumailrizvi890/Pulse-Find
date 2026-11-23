"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide textured 3D background — the dark textured look Kumail
 * approved in the preview (Nov 16 2026), extended from the hero.
 *
 * The hero already has its own local depth (HeroBackdrop: three red
 * glows, grain, vignette, pointer parallax). This is the same
 * atmosphere carried across the whole site so the landing sections,
 * dashboard, demo and auth pages stop reading as plain black: film
 * grain and a dot grid over deep charcoal, red edge glows plus the
 * preview's violet-tinted edge glows, a perspective 3D grid floor
 * anchoring the bottom of the viewport, and a few floating glass
 * shards and rings drifting behind the content.
 *
 * It is one fixed layer mounted in the root layout, behind everything
 * (negative z-index, pointer-events none, aria-hidden), so no page
 * needs its own copy. The parallax is the same rAF-throttled,
 * transform-only pattern as HeroBackdrop, with the same depth steps
 * the parallax check pins (±5/±9/±13px at the corners). It is
 * viewport-fixed, so unlike the hero it has no scroll guard — the
 * layer never scrolls away. Reduced motion: the drift and float
 * animations are off in CSS and the parallax listener never attaches.
 *
 * Cards stay readable because the glass treatment lives in
 * globals.css (.bg-surface / .bg-surface-2 go translucent with a top
 * highlight), not here — this layer is atmosphere only, never content.
 */
export function SiteBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-depth]"));
    if (layers.length === 0) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      raf = 0;
      for (const l of layers) {
        const d = Number(l.dataset.depth);
        l.style.transform = `translate3d(${(px * d).toFixed(1)}px, ${(py * d).toFixed(1)}px, 0)`;
      }
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div data-depth="10" className="absolute -top-[220px] right-[-160px] h-[560px] w-[820px]">
        <div className="pf-site-glow-far h-full w-full rounded-full" />
      </div>
      <div data-depth="18" className="absolute -left-[200px] top-[30%] h-[460px] w-[620px]">
        <div className="pf-site-glow-violet h-full w-full rounded-full" />
      </div>
      <div data-depth="26" className="absolute inset-x-[8%] bottom-[-180px] h-[320px]">
        <div className="pf-site-glow-near h-full w-full rounded-full" />
      </div>
      <div data-depth="18" className="absolute -bottom-[120px] right-[-140px] h-[380px] w-[520px]">
        <div className="pf-site-glow-violet h-full w-full rounded-full" />
      </div>
      <div className="pf-site-floor absolute inset-x-0 bottom-0 h-[38vh]" />
      {/* Floating glass job objects (Nov 23 2026), in place of the old
          abstract shards and ring: a briefcase, a resume with a check,
          an offer email, a calendar with a due date, and a grad cap.
          Same slow floats, same pointer parallax depth, line-art glass
          so they stay atmosphere and never compete with content. */}
      <svg className="pf-site-job pf-site-float-a absolute right-[6%] top-[16%] h-[110px] w-[110px]" viewBox="0 0 64 64" style={{ rotate: "-10deg" }}>
        <rect x="8" y="20" width="48" height="34" rx="6" />
        <path d="M24 20v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" />
        <path d="M8 34h48" />
        <rect className="acc" x="28" y="30" width="8" height="8" rx="2" />
      </svg>
      <svg className="pf-site-job pf-site-float-b absolute left-[2%] top-[50%] h-[96px] w-[96px]" viewBox="0 0 64 64" style={{ rotate: "8deg" }}>
        <path d="M16 6h24l10 10v40a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
        <path d="M40 6v10h10" />
        <path d="M21 27h18M21 34h22M21 41h14" />
        <path className="acc" d="M34 50l4 4 8-9" />
      </svg>
      <svg className="pf-site-job pf-site-float-c absolute bottom-[30%] right-[4%] h-[72px] w-[72px]" viewBox="0 0 64 64" style={{ rotate: "-6deg" }}>
        <rect x="6" y="14" width="52" height="36" rx="5" />
        <path d="M8 17l24 18 24-18" />
        <circle className="acc-fill" cx="52" cy="16" r="6" />
      </svg>
      <svg className="pf-site-job pf-site-float-b absolute left-[3%] top-[22%] hidden h-[62px] w-[62px] sm:block" viewBox="0 0 64 64" style={{ rotate: "12deg" }}>
        <rect x="8" y="12" width="48" height="44" rx="6" />
        <path d="M8 24h48M20 8v8M44 8v8" />
        <circle className="acc-fill" cx="40" cy="40" r="5" />
      </svg>
      <svg className="pf-site-job pf-site-float-a absolute bottom-[10%] left-[5%] hidden h-[70px] w-[70px] md:block" viewBox="0 0 64 64" style={{ rotate: "-14deg" }}>
        <path d="M32 12 4 24l28 12 28-12Z" />
        <path d="M16 30v12c0 4 7 8 16 8s16-4 16-8V30" />
        <path className="acc" d="M56 26v14" />
      </svg>
      <div className="pf-site-dots absolute inset-0" />
      <div className="pf-hero-grain absolute inset-0" />
      <div className="pf-hero-vignette absolute inset-0" />
    </div>
  );
}

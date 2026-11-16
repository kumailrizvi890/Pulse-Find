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
      <div className="pf-site-shard pf-site-float-a absolute right-[12%] top-[18%] h-[110px] w-[110px]" />
      <div className="pf-site-ring pf-site-float-b absolute left-[8%] top-[58%] h-[90px] w-[90px] rounded-full" />
      <div className="pf-site-shard pf-site-float-c absolute bottom-[24%] right-[22%] h-[64px] w-[64px]" />
      <div className="pf-site-dots absolute inset-0" />
      <div className="pf-hero-grain absolute inset-0" />
      <div className="pf-hero-vignette absolute inset-0" />
    </div>
  );
}

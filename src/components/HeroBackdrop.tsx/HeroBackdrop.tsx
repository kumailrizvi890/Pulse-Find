"use client";

import { useEffect, useRef } from "react";

/**
 * Textured 3D depth for the landing hero and the auth pages. DOM carries
 * the content; this carries the atmosphere: three red radial glows at
 * staggered depths, a fine grain, and a vignette that pulls the eye to
 * the center. All the existing red only — no new colors, no new
 * dependency, no WebGL. The glow layers drift slowly on their own and
 * shift a few pixels with the pointer (rAF-throttled, transform only,
 * skipped once the hero has scrolled away). Reduced motion: the drift
 * is off in CSS and the parallax listener never attaches.
 */
export function HeroBackdrop({ className = "" }: { className?: string }) {
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
      if (window.scrollY > window.innerHeight) return;
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
    <div ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {/* Far: big soft glow, top right, drifts slowly. */}
      <div data-depth="10" className="absolute -top-[180px] right-[-140px] h-[520px] w-[760px]">
        <div className="pf-hero-glow-far pf-hero-drift h-full w-full rounded-full" />
      </div>
      {/* Mid: cooler glow, left edge, moves a little more. */}
      <div data-depth="18" className="absolute -left-[180px] top-[24%] h-[420px] w-[560px]">
        <div className="pf-hero-glow-mid h-full w-full rounded-full" />
      </div>
      {/* Near: warm glow low in the frame, behind the pulse line, moves most. */}
      <div data-depth="26" className="absolute inset-x-[6%] bottom-[-150px] h-[300px]">
        <div className="pf-hero-glow-near h-full w-full rounded-full" />
      </div>
      {/* Grain + vignette: the texture. Static, over the glows. */}
      <div className="pf-hero-grain absolute inset-0" />
      <div className="pf-hero-vignette absolute inset-0" />
    </div>
  );
}

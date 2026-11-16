"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-triggered entrance for the landing sections below the hero:
 * one quiet rise (the design system's standard easing, 0.6s), staggered
 * by the caller with `delay`. Unlike the app-wide `.rise` class this is
 * driven by IntersectionObserver, so a section only moves when it actually
 * scrolls into view — and once the transition finishes the element
 * settles to its natural styles (no lingering transform), so it can never
 * become the containing block for a fixed-position descendant. Under
 * reduced motion everything renders in its final state immediately.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"hidden" | "visible" | "settled">("hidden");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Deferred one tick: setting state synchronously in the effect body
      // would be a cascading render (react-hooks/set-state-in-effect).
      const t = window.setTimeout(() => setState("settled"), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("visible");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Fallback in case transitionend never fires: settle anyway after the
  // transition (plus the longest stagger) has had time to finish.
  useEffect(() => {
    if (state !== "visible") return;
    const t = window.setTimeout(() => setState("settled"), 900);
    return () => window.clearTimeout(t);
  }, [state]);

  const cls =
    state === "hidden"
      ? "landing-reveal"
      : state === "visible"
        ? "landing-reveal is-visible"
        : "landing-reveal is-settled";
  return (
    <div
      ref={ref}
      className={`${cls} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      onTransitionEnd={() => {
        if (state === "visible") setState("settled");
      }}
    >
      {children}
    </div>
  );
}

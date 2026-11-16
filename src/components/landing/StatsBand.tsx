"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal";

const primary =
  "inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-[15px] font-semibold text-accent-ink shadow-panel transition hover:brightness-110";
const secondary =
  "inline-flex items-center justify-center rounded-xl border border-line bg-surface px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-surface-2";

/**
 * The rational close: the demo's numbers count up when the band scrolls
 * into view, then the two conversion buttons. Under reduced motion the
 * final numbers render immediately — no counting.
 */
export function StatsBand({
  total,
  oas,
  interviews,
  actions,
}: {
  total: number;
  oas: number;
  interviews: number;
  actions: number;
}) {
  return (
    <section className="border-t border-line bg-surface">
      <div className="gutter mx-auto w-full max-w-[1180px] py-16 text-center">
        <Reveal>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Your search, this organized.</h2>
          <p className="mx-auto mt-3 max-w-[52ch] text-muted">
            Sample data above. Yours fills in the moment you start applying.
          </p>
        </Reveal>
        <Reveal delay={90}>
          <dl className="mx-auto mt-10 grid max-w-[760px] grid-cols-2 gap-6 sm:grid-cols-4">
            <Stat value={total} label="Applications tracked" />
            <Stat value={oas} label="OAs" />
            <Stat value={interviews} label="Interviews" />
            <Stat value={actions} label="Waiting on you" />
          </dl>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className={primary}>
              Try the live demo
            </Link>
            <Link href="/login?mode=signup" className={secondary}>
              Create a free tracker
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const t = window.setTimeout(() => setShown(value), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / 900);
          const eased = 1 - Math.pow(1 - p, 3);
          setShown(Math.round(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return (
    <div ref={ref}>
      <dt className="sr-only">{label}</dt>
      <dd className="tnum font-display text-5xl font-extrabold tracking-tight text-accent">{shown}</dd>
      <dd className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{label}</dd>
    </div>
  );
}

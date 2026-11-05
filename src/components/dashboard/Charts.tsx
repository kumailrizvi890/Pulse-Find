"use client";

import { useEffect, useRef, useState } from "react";
import type { FunnelStep, WeekBucket } from "@/lib/metrics";
import { parseISO } from "@/lib/metrics";

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        return (
          <li key={s.label} className="grid grid-cols-[88px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
            <span className="text-muted">{s.label}</span>
            <span className="h-7 overflow-hidden rounded-md bg-surface-2">
              <span
                className="block h-full rounded-md bg-accent transition-[width] duration-700"
                style={{ width: `${Math.max(pct, s.value ? 3 : 0)}%`, opacity: 1 - i * 0.18 }}
              />
            </span>
            <span className="tnum text-right font-mono text-[13px]">
              {s.value}
              {i > 0 && <span className="ml-1 text-faint">{pct}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Stacked weekly bars drawn to one scale, with the weekly goal as a dashed rule. */
export function WeeklyBars({ weeks, goal }: { weeks: WeekBucket[]; goal: number }) {
  // Draw in real pixels so labels stay readable at any width.
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 210, L = 30, R = 8, T = 22, B = 26;
  const max = Math.max(goal, ...weeks.map((w) => w.tech + w.other), 1);
  const niceMax = Math.ceil((max * 1.1) / 5) * 5;
  const y = (v: number) => T + (H - T - B) * (1 - v / niceMax);
  const slot = (W - L - R) / weeks.length;
  const bw = Math.min(26, slot * 0.62);
  const ticks = [0, niceMax / 2, niceMax].map((v) => Math.round(v));
  const label = (s: string) => parseISO(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const total = weeks.reduce((s, w) => s + w.tech + w.other, 0);

  const labelEvery = W < 420 ? 4 : 3;

  return (
    <figure ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`Applications per week for the last ${weeks.length} weeks, ${total} in total`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">{t}</text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          const yOther = y(w.other);
          const yTech = y(w.other + w.tech);
          const last = i === weeks.length - 1;
          return (
            <g key={w.start}>
              <title>{`Week of ${label(w.start)}: ${w.tech} tech, ${w.other} other`}</title>
              {w.other > 0 && <rect x={x} y={yOther} width={bw} height={y(0) - yOther} rx="3" fill="var(--faint)" opacity="0.45" />}
              {w.tech > 0 && <rect x={x} y={yTech} width={bw} height={yOther - yTech} rx="3" fill="var(--tech)" />}
              {((weeks.length - 1 - i) % labelEvery === 0) && (
                <text x={last ? Math.min(x + bw / 2 + 14, W - 2) : x + bw / 2} y={H - 8} textAnchor={last ? "end" : "middle"} fontSize="10" fill={last ? "var(--ink)" : "var(--faint)"} fontFamily="var(--font-mono)">
                  {last ? "This wk" : label(w.start)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--accent)" strokeDasharray="5 4" strokeWidth="1.5" />
        <text x={W - R} y={y(goal) - 6} textAnchor="end" fontSize="11" fill="var(--accent)" fontFamily="var(--font-mono)">goal {goal}/wk</text>
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-tech" />Tech</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-faint/45" />Other</span>
      </figcaption>
    </figure>
  );
}

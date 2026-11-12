"use client";

import { useEffect, useRef, useState } from "react";
import type { FunnelStep, WeekBucket } from "@/lib/metrics";
import { parseISO } from "@/lib/metrics";

export function Funnel({ steps }: { steps: (FunnelStep & { color?: string })[] }) {
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
                style={{
                  width: `${Math.max(pct, s.value ? 3 : 0)}%`,
                  background: s.color,
                  opacity: s.color ? 1 : 1 - i * 0.18,
                }}
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
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`Applications per week, ${total} total`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">
              {t}
            </text>
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
              {w.other > 0 && <rect x={x} y={yOther} width={bw} height={y(0) - yOther} rx="3" fill="var(--faint)" opacity="0.4" />}
              {w.tech > 0 && <rect x={x} y={yTech} width={bw} height={yOther - yTech} rx="3" fill="var(--tech)" />}
              {((weeks.length - 1 - i) % labelEvery === 0) && (
                <text x={last ? Math.min(x + bw / 2 + 14, W - 2) : x + bw / 2} y={H - 8} textAnchor={last ? "end" : "middle"} fontSize="10" fill="var(--faint)" fontFamily="var(--font-mono)">
                  {last ? "This wk" : label(w.start)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--accent)" strokeDasharray="5 4" strokeWidth="1.5" />
        <text x={W - R} y={y(goal) - 6} textAnchor="end" fontSize="11" fill="var(--accent)" fontFamily="var(--font-mono)">
          Goal {goal}
        </text>
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-tech" />
          Tech
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm bg-faint" />
          Other
        </span>
      </figcaption>
    </figure>
  );
}

export interface PaceDay {
  label: string;
  sub: string;
  value: number;
}

/** Applications per day for the current week, with a red trend line over the bars. */
export function WeeklyPace({
  days,
  total,
  change,
}: {
  days: PaceDay[];
  total: number;
  change: number | null;
}) {
  const max = Math.max(...days.map((d) => d.value), 1);
  const average = days.length === 0 ? 0 : total / days.length;
  const points = days
    .map((d, i) => {
      const x = ((i + 0.5) / days.length) * 100;
      const y = 96 - (d.value / max) * 84;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div>
      <div className="relative">
        <div className="flex items-end gap-2" role="list" aria-label="Applications per day this week">
          {days.map((d) => (
            <div key={d.label} role="listitem" className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold tabular-nums text-foreground">{d.value}</span>
              <div className="flex h-28 w-full items-end overflow-hidden rounded-md bg-muted/40">
                <div
                  className="w-full rounded-md bg-emerald-500"
                  style={{ height: d.value === 0 ? "4px" : `${Math.max(10, (d.value / max) * 100)}%` }}
                  title={`${d.label}: ${d.value}`}
                />
              </div>
              <span className="text-center text-[11px] leading-tight text-muted-foreground">{d.label}</span>
              <span className="text-center text-[10px] leading-tight text-muted-foreground">{d.sub}</span>
            </div>
          ))}
        </div>
        {max > 0 && days.length > 1 && (
          <svg className="pointer-events-none absolute inset-x-0 top-5 h-28 w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points} fill="none" stroke="#f43f5e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-medium text-emerald-400">
          Total this week: {total}
        </span>
        <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
          Avg / day: {average.toFixed(1)}
        </span>
        {change === null ? (
          <span className="font-medium text-muted-foreground">No applications last week</span>
        ) : (
          <span className={change >= 0 ? "font-medium text-emerald-400" : "font-medium text-rose-400"}>
            {change >= 0 ? "↗" : "↘"} {Math.abs(change)}% vs last week
          </span>
        )}
      </div>
    </div>
  );
}

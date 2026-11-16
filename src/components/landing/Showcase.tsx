"use client";

import Link from "next/link";
import { useRef } from "react";
import { WeeklyPace, type PaceDay } from "@/components/dashboard/Charts";
import { Tag } from "@/components/dashboard/ui";
import { Reveal } from "./Reveal";

export type ShowcaseQueueItem = { company: string; action: string; dueLabel: string; urgent: boolean };
export type ShowcaseGhostedItem = { company: string; quietDays: number };

/**
 * The three live widgets that replace the old text-only feature trio.
 * Each one is a real render of the demo data (fictional sample data,
 * computed in page.tsx) — not a screenshot: the waiting queue, the
 * ghosted list, and the weekly pace chart. Cards tilt a few degrees
 * toward the pointer on fine-pointer devices only, and sit still under
 * reduced motion or touch.
 */
export function Showcase({
  queue,
  actionsOpen,
  ghosted,
  ghostedTotal,
  paceDays,
  paceTotal,
  paceChange,
  goal,
}: {
  queue: ShowcaseQueueItem[];
  actionsOpen: number;
  ghosted: ShowcaseGhostedItem[];
  ghostedTotal: number;
  paceDays: PaceDay[];
  paceTotal: number;
  paceChange: number | null;
  goal: number;
}) {
  return (
    <section className="gutter mx-auto w-full max-w-[1180px] py-16">
      <Reveal>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Live from the demo</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Your search, at a glance</h2>
        <p className="mt-3 max-w-[56ch] text-muted">
          Sample data, no sign-up. This is what your tracker looks like after a week of applying.
        </p>
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        <Reveal delay={0} className="min-w-0">
          <TiltCard>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">What&apos;s next</h3>
              <Tag tone="danger">{actionsOpen} open</Tag>
            </div>
            <p className="mb-4 text-sm text-muted">Soonest deadline first.</p>
            <ul className="divide-y divide-line">
              {queue.map((a) => (
                <li key={a.company} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-danger">{a.company}</p>
                    <p className="truncate text-[13px] text-muted">{a.action}</p>
                  </div>
                  <Tag tone={a.urgent ? "danger" : "warn"}>{a.dueLabel}</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              <Link href="/demo" className="text-sm font-semibold text-accent">
                Open the demo →
              </Link>
            </p>
          </TiltCard>
        </Reveal>
        <Reveal delay={90} className="min-w-0">
          <TiltCard>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Who went quiet</h3>
              <Tag tone="muted">{ghostedTotal} flagged</Tag>
            </div>
            <p className="mb-4 text-sm text-muted">Flagged after 21 days silent.</p>
            <ul className="divide-y divide-line">
              {ghosted.map((g) => (
                <li key={g.company} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.company}</p>
                    <p className="truncate text-[13px] text-muted">No reply since they applied</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-danger">quiet {g.quietDays}d</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              And {ghostedTotal - ghosted.length} more, waiting for a nudge.
            </p>
          </TiltCard>
        </Reveal>
        <Reveal delay={180} className="min-w-0">
          <TiltCard>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">This week&apos;s pace</h3>
              <span className="rounded-full bg-accent-soft px-3 py-1 font-mono text-xs font-semibold text-accent">
                {paceTotal} / {goal}
              </span>
            </div>
            <p className="mb-4 text-sm text-muted">One week of effort, at a glance.</p>
            <WeeklyPace days={paceDays} total={paceTotal} change={paceChange} />
          </TiltCard>
        </Reveal>
      </div>
    </section>
  );
}

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * 4).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="landing-tilt h-full rounded-[22px] border border-line bg-surface p-5 shadow-panel"
    >
      {children}
    </div>
  );
}

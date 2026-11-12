"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/dashboard/ui";

export type DeckJob = {
  id: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  track: string;
  tech: boolean;
  posted_at: string | null;
};

const THRESHOLD = 110;

function initials(name: string) {
  const w = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w[1]?.[0] ?? "")).toUpperCase() : "?";
}
function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
function ago(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "Posted today" : days === 1 ? "Posted yesterday" : `Posted ${days}d ago`;
}

type Props = {
  queue: DeckJob[];
  loading: boolean;
  onDecide: (job: DeckJob, choice: "saved" | "hidden") => void;
  onUndo: () => void;
  canUndo: boolean;
  emptyText: string;
};

/** Tinder-style deck: drag right (or press →) to save, left (or ←) to pass. */
export function SwipeDeck({ queue, loading, onDecide, onUndo, canUndo, emptyText }: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<"saved" | "hidden" | null>(null);
  const start = useRef(0);
  const top = queue[0];

  const decide = (choice: "saved" | "hidden") => {
    if (!top || leaving) return;
    setLeaving(choice);
    setTimeout(() => {
      onDecide(top, choice);
      setLeaving(null);
      setDx(0);
    }, 220);
  };
  const decideRef = useRef(decide);
  useEffect(() => { decideRef.current = decide; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); decideRef.current("saved"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); decideRef.current("hidden"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const offset = leaving === "saved" ? 900 : leaving === "hidden" ? -900 : dx;
  const strength = Math.min(Math.abs(offset) / THRESHOLD, 1);

  return (
    <div className="mx-auto flex w-full max-w-[380px] flex-col items-center">
      <div className="relative h-[400px] w-full select-none overflow-hidden">
        {!top ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {loading ? "Loading openings…" : emptyText}
          </div>
        ) : (
          queue.slice(0, 3).map((j, i) => {
            const isTop = i === 0;
            const h = hue(j.company);
            const style = isTop
              ? { transform: `translateX(${offset}px) rotate(${offset / 14}deg)`, opacity: leaving ? 0 : 1, zIndex: 3 }
              : { transform: `translateY(${i * 12}px) scale(${1 - i * 0.045})`, opacity: 1 - i * 0.3, zIndex: 3 - i };
            return (
              <article
                key={j.id}
                aria-hidden={!isTop}
                style={style}
                className={cx(
                  "absolute inset-0 flex flex-col items-center rounded-3xl border border-line bg-surface p-6 text-center shadow-panel",
                  isTop ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none",
                  !(isTop && dragging) && "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
                )}
                onPointerDown={isTop ? (e) => {
                  if (leaving) return;
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  start.current = e.clientX;
                  setDragging(true);
                } : undefined}
                onPointerMove={isTop ? (e) => { if (dragging) setDx(e.clientX - start.current); } : undefined}
                onPointerUp={isTop ? () => {
                  setDragging(false);
                  if (dx > THRESHOLD) decide("saved");
                  else if (dx < -THRESHOLD) decide("hidden");
                  else setDx(0);
                } : undefined}
                onPointerCancel={isTop ? () => { setDragging(false); setDx(0); } : undefined}
              >
                {isTop && (
                  <>
                    <span className="absolute right-5 top-5 rotate-[-12deg] rounded-lg border-[2.5px] border-good px-3 py-1 font-mono text-sm font-extrabold text-good" style={{ opacity: offset > 0 ? strength : 0 }}>SAVE</span>
                    <span className="absolute left-5 top-5 rotate-[12deg] rounded-lg border-[2.5px] border-danger px-3 py-1 font-mono text-sm font-extrabold text-danger" style={{ opacity: offset < 0 ? strength : 0 }}>PASS</span>
                  </>
                )}
                <div
                  className="mt-6 flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: `conic-gradient(from 210deg, hsl(${h} 70% 50%), hsl(${(h + 60) % 360} 70% 58%), hsl(${(h + 120) % 360} 65% 50%), hsl(${h} 70% 50%))` }}
                >
                  {initials(j.company)}
                </div>
                <p className="mt-4 text-sm font-semibold text-muted">{j.company}</p>
                <h3 className="mt-1 line-clamp-3 font-display text-xl font-bold leading-snug tracking-tight">{j.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{j.location || "Location not listed"}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  <span className="rounded-full border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">{j.track}</span>
                  {j.tech && <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] text-accent">Tech</span>}
                  {j.remote && <span className="rounded-full border border-good/30 bg-good-soft px-2.5 py-0.5 font-mono text-[11px] text-good">Remote</span>}
                </div>
                <div className="mt-auto flex w-full items-center justify-between pt-4 text-xs text-faint">
                  <span>{ago(j.posted_at) ?? ""}</span>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-accent hover:underline"
                    onPointerDown={(e) => e.stopPropagation()}
                    tabIndex={isTop ? 0 : -1}
                  >
                    View posting ↗
                  </a>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-6 flex items-center gap-5">
        <button
          type="button"
          aria-label="Pass"
          disabled={!top}
          onClick={() => decide("hidden")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-danger text-xl text-white shadow-panel transition hover:scale-105 disabled:opacity-35"
        >
          ✕
        </button>
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-lg text-ink transition hover:scale-105 disabled:opacity-35"
        >
          ↺
        </button>
        <button
          type="button"
          aria-label="Save"
          disabled={!top}
          onClick={() => decide("saved")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-good text-xl text-white shadow-panel transition hover:scale-105 disabled:opacity-35"
        >
          ✓
        </button>
      </div>
      <p className="mt-3 font-mono text-[11px] text-faint">Drag the card, tap the buttons, or use ← →</p>
    </div>
  );
}

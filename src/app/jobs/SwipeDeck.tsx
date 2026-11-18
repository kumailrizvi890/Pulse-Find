"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/dashboard/ui";
import { IconCheck, IconDetails, IconUndo, IconX } from "@/components/icons";
import { PulseHeartbeat, WaitingSignal } from "@/components/PulseBrand";

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
// The card flies out this far and this fast once a drag or a button
// decides it, and snaps back over this long when the drag falls short.
const FLY_OUT_PX = 480;
const FLY_OUT_MS = 280;
const SNAP_BACK_MS = 250;

export function initials(name: string) {
  const w = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w[1]?.[0] ?? "")).toUpperCase() : "?";
}
export function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
/** Per-company banner gradient, from the same name hash as the avatar tone. */
export function bannerStyle(name: string): { background: string } {
  const h = hue(name);
  return {
    background: `linear-gradient(135deg, hsl(${h} 65% 42%) 0%, hsl(${(h + 40) % 360} 70% 26%) 100%)`,
  };
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
  /** Opens the details panel for the top card (mobile) or scrolls to it (desktop). */
  onDetails: (job: DeckJob) => void;
  /** Re-reviews the passed jobs in this view; absent when nothing was reviewed. */
  onReviewAgain?: () => void;
  canReviewAgain?: boolean;
};

/**
 * Tinder-style deck, mockup layout: a 172px per-company banner with the
 * brand tile and posted pill, then role, company, location and chips.
 * The two cards behind the front one are blank offset shells — they
 * never carry text, so no ghost copy can bleed through. The live feed
 * carries no fit score, compensation, description, checklist or HR
 * note, so none of those are rendered (and none are invented): the card
 * shows only what the posting actually has.
 */
export function SwipeDeck({ queue, loading, onDecide, onUndo, canUndo, emptyText, onDetails, onReviewAgain, canReviewAgain }: Props) {
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
    }, FLY_OUT_MS);
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

  const offset = leaving === "saved" ? FLY_OUT_PX : leaving === "hidden" ? -FLY_OUT_PX : dx;
  // The stamps fade in once the drag passes 20px, at |dx| / 90.
  const stampOpacity = (dir: 1 | -1) =>
    (dir === 1 ? offset > 20 : offset < -20) ? Math.min(Math.abs(offset) / 90, 1) : 0;

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col items-center">
      {/* The active card's halo lives on this wrapper, not on the card
      itself: the deck container below is overflow-hidden (the swipe
      fly-off needs the clipping), and overflow-hidden clips a
      box-shadow, so a pf-glow on the card would be invisible. The
      wrapper is exactly the card's size, so the halo hugs the active
      card the way it hugs the "Waiting on you" panel. The border is
      always present (transparent when empty) so the deck never shifts
      size between the glowing and the empty state. The glow only
      shows while there is a top card, like the panel only glows while
      something is waiting. */}
    <div className={cx("w-full rounded-3xl border border-transparent", top ? "border-danger/30 pf-glow" : undefined)}>
      <div className="relative h-[400px] w-full select-none overflow-hidden">
        {!top ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted">
            {loading ? (
              <>
                <PulseHeartbeat label="Loading openings" />
                <p>Loading openings…</p>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-bold text-ink">Deck cleared</p>
                <p>{emptyText}</p>
                <WaitingSignal className="justify-center" />
                {canReviewAgain && onReviewAgain && (
                  <button type="button" onClick={onReviewAgain} className="mt-1 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-panel transition hover:scale-[1.03]">
                    Review again
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Blank offset shells behind the front card: shape only,
              never text. A previous deck rendered the next two jobs
              here, and their copy showed through as ghost text. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl border border-line bg-surface" style={{ transform: "translate(14px, 10px) rotate(1.6deg)", opacity: 0.55, zIndex: 1 }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-3xl border border-line bg-surface" style={{ transform: "translate(7px, 5px) rotate(0.8deg)", opacity: 0.8, zIndex: 2 }} />
            <article
              key={top.id}
              style={{
                transform: `translateX(${offset}px) rotate(${leaving ? (leaving === "saved" ? 6 : -6) : offset / 24}deg)`,
                opacity: leaving ? 0 : 1,
                zIndex: 3,
                transition: leaving
                  ? `transform ${FLY_OUT_MS}ms ease-in, opacity ${FLY_OUT_MS}ms ease-in`
                  : dragging ? undefined : `transform ${SNAP_BACK_MS}ms ease-out, opacity ${SNAP_BACK_MS}ms ease-out`,
              }}
              className={cx(
                "absolute inset-0 flex flex-col items-center rounded-3xl border border-line bg-surface p-6 text-center shadow-panel",
                "cursor-grab touch-none active:cursor-grabbing motion-reduce:transition-none",
              )}
              onPointerDown={(e) => {
                if (leaving) return;
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                start.current = e.clientX;
                setDragging(true);
              }}
              onPointerMove={(e) => { if (dragging) setDx(e.clientX - start.current); }}
              onPointerUp={() => {
                setDragging(false);
                if (dx > THRESHOLD) decide("saved");
                else if (dx < -THRESHOLD) decide("hidden");
                else setDx(0);
              }}
              onPointerCancel={() => { setDragging(false); setDx(0); }}
            >
              <span className="absolute right-5 top-5 z-10 rotate-[-12deg] rounded-lg border-[2.5px] border-good px-3 py-1 font-mono text-sm font-extrabold text-good" style={{ opacity: stampOpacity(1) }}>SAVE</span>
              <span className="absolute left-5 top-5 z-10 rotate-[12deg] rounded-lg border-[2.5px] border-danger px-3 py-1 font-mono text-sm font-extrabold text-danger" style={{ opacity: stampOpacity(-1) }}>PASS</span>
              {/* Banner: per-company gradient, brand tile + name, posted pill. */}
              <div className="relative -mx-6 -mt-6 h-[172px] w-[calc(100%+3rem)] shrink-0 overflow-hidden rounded-t-3xl" style={bannerStyle(top.company)}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" aria-hidden="true" />
                {ago(top.posted_at) && (
                  <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {ago(top.posted_at)}
                  </span>
                )}
                <div className="absolute bottom-3 left-4 flex items-center gap-3">
                  <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-white text-xl font-extrabold shadow-panel" style={{ color: `hsl(${hue(top.company)} 65% 38%)` }}>
                    {initials(top.company)}
                  </span>
                  <span className="text-left font-display text-[27px] font-extrabold leading-none tracking-tight text-white">{top.company}</span>
                </div>
              </div>
              <div className="flex w-full flex-1 flex-col items-start pt-4 text-left">
                <h3 className="line-clamp-2 font-display text-[25px] font-extrabold leading-tight tracking-tight">{top.title}</h3>
                <p className="mt-1 text-[15px] font-bold text-muted">{top.company}</p>
                <p className="mt-1 text-sm text-muted">{top.location || "Location not listed"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md border border-line px-2.5 py-0.5 font-mono text-[11px] text-muted">{top.track}</span>
                  {top.tech && <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] text-accent">Tech</span>}
                  {top.remote && <span className="rounded-full border border-good/30 bg-good-soft px-2.5 py-0.5 font-mono text-[11px] text-good">Remote</span>}
                </div>
                <div className="mt-auto flex w-full items-center justify-between pt-3 text-xs text-faint">
                  <span>{ago(top.posted_at) ?? ""}</span>
                  {top.url ? (
                    <a
                      href={top.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-tour="job-posting"
                      className="font-semibold text-accent hover:underline"
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      View posting ↗
                    </a>
                  ) : (
                    <span className="text-faint">No posting link listed</span>
                  )}
                </div>
              </div>
            </article>
          </>
        )}
      </div>

      </div>

    <div className="mt-6 flex items-center gap-5">
        <button
          type="button"
          aria-label="Pass"
          disabled={!top}
          onClick={() => decide("hidden")}
          className="flex h-[58px] w-[58px] items-center justify-center rounded-full border border-line bg-surface text-ink shadow-panel transition hover:scale-105 disabled:opacity-35"
        >
          <IconX className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Details"
          disabled={!top}
          onClick={() => top && onDetails(top)}
          className="flex h-[46px] w-[46px] -translate-y-1.5 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-panel transition hover:scale-105 disabled:opacity-35"
        >
          <IconDetails className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={onUndo}
          className="flex h-[46px] w-[46px] items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:scale-105 disabled:opacity-35"
        >
          <IconUndo className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label="Save"
          data-tour="job-save"
          disabled={!top}
          onClick={() => decide("saved")}
          className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_24px_rgba(253,88,93,0.45)] transition hover:scale-105 disabled:opacity-35"
        >
          <IconCheck className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-3 font-mono text-[11px] text-faint">
        Drag the card, tap the buttons, or use{" "}
        <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink">←</kbd> pass{" "}
        <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink">→</kbd> save
      </p>
    </div>
  );
}

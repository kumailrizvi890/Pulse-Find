"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { answerGeneralQuestion, DEFAULT_APP_ORIGIN, type GeneralChatContext } from "@/lib/task-chat";
import { demoApplications, demoEvents } from "@/lib/demo-data";
import { demoContacts } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";
import {
  nextTourStep,
  parseTourStep,
  placeTourCard,
  prevTourStep,
  tourHref,
  tourStartHref,
  TOUR_DISMISSED_KEY,
  TOUR_STEPS,
  tourStepIndex,
  type CardPlacement,
} from "@/lib/guided-tour";
import { PulseDot } from "@/components/PulseBrand";
import { IconX } from "@/components/icons";

// The tour runs on the public demo routes only, driven by ?tour=<step>.
// It renders nothing anywhere else, and nothing when the param is absent.
// Each step navigates to its route, spotlights the step's data-tour
// anchor with a ring, and narrates in the card. The visitor can go back
// a step, skip the whole tour, or exit at any time (Escape too).
//
// The card is never a modal: the wrapper passes pointer events through,
// the dim and the ring never take them, and only the card itself takes
// clicks. That is what lets a visitor try the feature a step is about
// while the tour stays open. The ring is positioned from the anchor's
// live bounding box and re-measured on scroll and resize, so it stays
// glued to the feature. If an anchor never appears (a slow load, the
// list view on /jobs), the card still shows and the tour still works,
// just without the ring.
//
// The card moves instead of parking bottom-right: it is placed right of
// the anchor, then left, then below, then above, and only falls back to
// the bottom dock when the anchor is huge or full-viewport (the
// dashboard step). Phones keep the bottom sheet. The card sits above the
// dim on its own z-index with a solid background, so the dim can never
// wash it out.
//
// Auto-start: landing on plain /demo with no tour param opens step 1 on
// its own, unless the visitor already skipped, exited or finished the
// tour in this session (a sessionStorage flag). Any arrival with a
// ?tour= param clears that flag, so the hero demo button and the demo
// nav "Take the tour" link always force-start the tour. Arriving with
// ?chat=1 suppresses the auto-start instead: the chat takes precedence,
// so the tour card never sits over the open chat panel. The tour still
// starts by hand afterwards, from "Take the tour" in the demo nav.

const TOUR_ROUTES = ["/demo", "/demo/sheet", "/demo/leads", "/demo/networking", "/demo/connect", "/jobs"];

const CHAT_QUESTION = "What networking follow-ups are due?";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function dismissed(): boolean {
  try {
    return sessionStorage.getItem(TOUR_DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

export function GuidedTour() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const step = parseTourStep(searchParams.get("tour"));
  const active = step !== null && TOUR_ROUTES.includes(pathname);
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [placement, setPlacement] = useState<CardPlacement | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const pulseTimer = useRef<number | null>(null);

  const exit = useCallback(() => {
    try {
      sessionStorage.setItem(TOUR_DISMISSED_KEY, "1");
    } catch {
      // A browser that blocks session storage still exits the tour.
    }
    router.replace(pathname);
  }, [router, pathname]);

  // A tour arrival always clears the dismissed flag, so the hero demo
  // button and the "Take the tour" replay link force-start even after
  // a visitor skipped once.
  useEffect(() => {
    if (!active) return;
    try {
      sessionStorage.removeItem(TOUR_DISMISSED_KEY);
    } catch {
      // Nothing to clear when session storage is blocked.
    }
  }, [active]);

  // Auto-start on plain /demo only: no tour param, no dismissal this
  // session, and not a demo sub-page or the signed-in app. Replace, so
  // no extra history entry is left behind for Back to restart into.
  // The chat takes precedence: arriving with ?chat=1 opens the chat
  // instead of the tour, so the tour card never sits over the open
  // chat panel. The decision is made once per mount, because
  // DemoDashboard clears ?chat=1 right after the chat opens, and a
  // bare param check would re-fire the moment the param is gone.
  // The tour stays startable by hand afterwards ("Take the tour").
  const autoStartChecked = useRef(false);
  useEffect(() => {
    if (autoStartChecked.current) return;
    autoStartChecked.current = true;
    if (pathname !== "/demo" || step !== null || dismissed()) return;
    if (searchParams.get("chat") === "1") return;
    router.replace(tourStartHref());
  }, [pathname, step, router, searchParams]);

  // A step opened on the wrong route (a pasted link, a stale tab) moves
  // to the step's own route instead of showing the wrong page.
  useEffect(() => {
    if (active && step && step.route !== pathname) router.replace(tourHref(step));
  }, [active, step, pathname, router]);

  // Keep the ring on the step's anchor: measure after navigation and
  // again while the page settles, then follow scrolls and resizes.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;
    let tries = 0;
    let raf = 0;
    const measure = (scroll: boolean) => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (el) {
        if (scroll) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
        raf = requestAnimationFrame(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          setRect({ x: r.x, y: r.y, width: r.width, height: r.height });
        });
        return;
      }
      tries += 1;
      if (tries < 40) window.setTimeout(() => measure(false), 100);
      else {
        // No anchor: no ring, and the card docks instead of keeping a
        // stale spot next to a feature that never showed up.
        setRect(null);
        setPlacement(null);
      }
    };
    measure(true);
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => measure(false));
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [active, step, pathname]);

  // Move the card next to the anchor instead of over it. The height is
  // measured from the live card, never hard-coded. Phones keep the
  // bottom sheet, and a huge anchor falls back to the bottom dock.
  useEffect(() => {
    if (!active || !rect) return;
    const place = () => {
      if (window.innerWidth < 640) {
        setPlacement(null);
        return;
      }
      const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
      if (!cardHeight) return;
      setPlacement(
        placeTourCard(rect, { width: window.innerWidth, height: window.innerHeight }, cardHeight),
      );
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, rect, step]);

  useEffect(() => {
    return () => {
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  // The card takes keyboard focus on each step so the tour works without
  // a mouse, and Escape exits from anywhere in the tour.
  useEffect(() => {
    if (active) cardRef.current?.focus({ preventScroll: true });
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, exit]);

  // Try it: scroll the feature into view, focus the first thing inside
  // it a visitor can use, and pulse the ring once. The step does not
  // advance, so the visitor can click around and keep the tour open.
  const tryIt = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.anchor}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    const target = (el.querySelector(FOCUSABLE) as HTMLElement | null) ?? (el as HTMLElement);
    target.focus({ preventScroll: true });
    setPulsing(true);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsing(false), 1200);
  }, [step]);

  // The chat step shows the real answer, computed from the same demo data
  // the page runs on, through the same deterministic function the chat
  // itself uses. Nothing here is typed by hand.
  const chatAnswer = useMemo(() => {
    if (step?.id !== "chat") return null;
    const today = todayISO();
    const apps = demoApplications(today);
    const ctx: GeneralChatContext = {
      apps,
      events: demoEvents(apps),
      contacts: demoContacts(today),
      today,
      origin: DEFAULT_APP_ORIGIN,
      ghostDays: 21,
      weeklyGoal: 8,
      trackerPath: "/demo",
    };
    return answerGeneralQuestion(CHAT_QUESTION, ctx);
  }, [step?.id]);

  if (!active || !step) return null;
  const index = tourStepIndex(step);
  const next = nextTourStep(step);
  const prev = prevTourStep(step);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-labelledby="tour-title">
      {rect && (
        <div
          className={`tour-ring${pulsing ? " tour-ring-pulse" : ""}`}
          aria-hidden="true"
          style={{ left: rect.x - 8, top: rect.y - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        style={placement ? { left: placement.left, top: placement.top } : undefined}
        className={`tour-card pointer-events-auto fixed inset-x-3 bottom-3 rounded-2xl border border-line p-5 shadow-panel outline-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px] ${
          placement ? "sm:bottom-auto sm:right-auto" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            <PulseDot />
            Guided tour · Step {index + 1} of {TOUR_STEPS.length}
          </p>
          <button
            onClick={exit}
            aria-label="Exit tour"
            className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-3 font-display text-xl font-bold tracking-tight">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
        {step.id === "chat" && chatAnswer && (
          <div className="mt-4 space-y-2 rounded-xl border border-line bg-bg p-3">
            <p className="ml-auto w-fit max-w-full rounded-xl rounded-br-sm bg-accent-soft px-3 py-2 text-sm text-ink">
              {CHAT_QUESTION}
            </p>
            <p className="w-fit max-w-full whitespace-pre-line rounded-xl rounded-bl-sm bg-surface-2 px-3 py-2 text-sm text-ink">
              {chatAnswer.text}
            </p>
            <p>
              <Link href="/demo?tour=chat&chat=1" className="text-sm font-semibold text-accent">
                Try Ask Pulse yourself →
              </Link>
            </p>
          </div>
        )}
        <div className="mt-4">
          <button
            onClick={tryIt}
            className="rounded-xl border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent hover:text-accent-ink"
          >
            {step.tryIt}
          </button>
          <p className="mt-2 text-xs text-muted">Go ahead, try it, the tour stays open.</p>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => prev && router.push(tourHref(prev))}
            disabled={!prev}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-40"
          >
            Back
          </button>
          {next ? (
            <button
              onClick={() => router.push(tourHref(next))}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-panel transition hover:brightness-110"
            >
              Next
            </button>
          ) : (
            <button
              onClick={exit}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-panel transition hover:brightness-110"
            >
              Finish
            </button>
          )}
          <button onClick={exit} className="ml-auto text-sm font-medium text-muted transition hover:text-ink">
            Skip tour
          </button>
        </div>
        <div className="mt-4 flex gap-1.5" aria-label={`Step ${index + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => router.push(tourHref(s))}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              className={`h-1.5 flex-1 rounded-full transition ${i === index ? "bg-accent" : i < index ? "bg-accent/40" : "bg-line"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

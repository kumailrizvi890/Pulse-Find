"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TOUR_BADGES,
  TOUR_PROGRESS_KEY,
  TOUR_RING_RADIUS,
  badgeForStep,
  emptyTourProgress,
  isDemoPath,
  nextTourStep,
  parseTourStep,
  placeTourCard,
  progressAfterCompletion,
  tourHref,
  tourProgressFraction,
  tourRecapLines,
  tourRingDash,
  tourStartHref,
  TOUR_ADVANCE_MS,
  TOUR_ADVANCE_MS_REDUCED,
  TOUR_DISMISSED_KEY,
  TOUR_STEPS,
  tourStepIndex,
  type CardPlacement,
  type TourProgress,
} from "@/lib/guided-tour";
import { PulseCrystal } from "@/components/PulseBrand";
import { IconX } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";

// The tour runs on the public demo routes only, driven by ?tour=<step>.
// It renders nothing anywhere else, and nothing when the param is absent.
//
// This is a quest, not a modal: the coach is a small bottom sheet with
// the crystal and one line from Pulse, and it has no action buttons.
// Each step advances only when the visitor does the real thing in the
// real UI (open a waiting task, pick a stage in the sheet filter, save
// a job, ask the chat a question, copy the prompt). The coach only
// talks and spotlights the target with a pulsing ring, so the page
// stays visible and tappable underneath. There is no dim overlay. The
// only coach controls are the progress dots (revisit a step), Skip on
// every step, and Done on the last one, which collapses the coach to
// the floating crystal. Escape exits from anywhere in the tour.
//
// The tour scrolls for the visitor: on every step it smoothly scrolls
// the step's anchor into the center of the viewport once, then never
// scrolls again for that step, so the visitor only ever presses the
// one button Pulse names. The ring tracks the anchor while the page
// scrolls by writing straight to the ring element (no React state per
// scroll frame): the old shape re-rendered the whole coach on every
// scroll event and the ring's 0.25s transition lagged 250ms behind
// the anchor, which is what made scrolling feel glitchy and stuck and
// the glow detach from its target once the visitor scrolled past it.
//
// Rewards are guidance-first, not an achievement wall: a progress
// ring around the crystal fills as steps complete, a small chip
// appears for each badge earned by doing the real action (Explorer,
// Inbox Zero, Networker), and the last step shows a short recap of
// what the visitor just did. Earned steps and badges persist in
// localStorage, so a replay shows what was earned. Badges are never
// earned by tapping through: there is no Next button, and advance is
// on real actions only.
//
// Safety: the tour never performs an action itself, it only watches
// for one. Every completion action is non-destructive. On the demo the
// same actions may write sample data only (save a demo job, edit a
// demo cell). On signed-in pages the tour only ever asks for focus,
// open, preview or copy. The jobs step is the one place the mode
// matters: a signed-out visitor saves a demo card (localStorage or
// demo sample data), a signed-in visitor only opens a posting to peek
// at it, never saves a real job. The mode is read once from the
// Supabase session on mount; when the session cannot be read, the
// safe signed-in mode wins.
//
// The coach is a bottom sheet on phones (never more than ~35% of the
// viewport) and sits next to the spotlighted anchor on desktop, via
// the same placement the old card used. When a dialog opens over the
// page (the chat panel, a task drawer, a lead or contact edit form),
// the coach steps aside entirely and the ring hides, so the dialog
// stays fully usable: the floating assistant already follows this
// convention, and a slim bar on top would cover the dialog's own
// header and Close button (a top bar was tried and caught clicks on
// the drawer's Close). The tour resumes the moment the dialog closes,
// the done line shows, and the advance fires.
//
// Auto-start: landing on plain /demo with no tour param opens step 1 on
// its own, unless the visitor already skipped, exited or finished the
// tour in this session (a sessionStorage flag). Any arrival with a
// ?tour= param clears that flag, so the hero demo button and the demo
// nav "Take the tour" link always force-start the tour. Arriving with
// ?chat=1 suppresses the auto-start instead: the chat takes precedence,
// so the tour coach never sits over the open chat panel. The tour still
// starts by hand afterwards, from "Take the tour" in the demo nav.

const TOUR_ROUTES = ["/demo", "/demo/sheet", "/demo/leads", "/demo/networking", "/demo/connect", "/jobs"];

/** Buttons whose text is one of the Jobs track filters. */
const JOB_TRACK_FILTERS = ["Internships", "New grad", "All roles"];

/** How long after the last scroll event the coach placement settles. */
const SCROLL_SETTLE_MS = 200;

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

/** What the visitor has earned so far, read once on mount. A blocked
    or corrupt store reads as empty: the tour still runs, it just
    starts the ring and the chips from zero. */
function readTourProgress(): TourProgress {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return emptyTourProgress();
    const raw = localStorage.getItem(TOUR_PROGRESS_KEY);
    if (!raw) return emptyTourProgress();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyTourProgress();
    const steps = Array.isArray((parsed as TourProgress).steps)
      ? (parsed as TourProgress).steps.filter((s) => TOUR_STEPS.some((t) => t.id === s))
      : [];
    const badges = Array.isArray((parsed as TourProgress).badges)
      ? (parsed as TourProgress).badges.filter((b) => TOUR_BADGES.some((t) => t.id === b))
      : [];
    return { steps, badges };
  } catch {
    return emptyTourProgress();
  }
}

function writeTourProgress(progress: TourProgress): void {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    localStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // A browser that blocks local storage still runs the tour.
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
  // Which step Pulse has already cheered for. Derived from the step,
  // so moving to another step (a dot, the advance, browser Back)
  // resets it without an effect: the render adjustment below clears
  // it the moment the step id changes.
  const [doneStep, setDoneStep] = useState<string | null>(null);
  const [prevStepId, setPrevStepId] = useState<string | undefined>(step?.id);
  if (step?.id !== prevStepId) {
    setPrevStepId(step?.id);
    setDoneStep(null);
    // The ring belongs to the old step until the new anchor is
    // measured: clear it here (the render-adjustment pattern, same as
    // the done-step reset above) instead of in the measure effect,
    // where a setState call is a lint error.
    setRect(null);
  }
  const done = doneStep === step?.id;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  // Steps completed and badges earned, seeded from localStorage so a
  // replay shows what was earned. Only real actions ever add to it.
  const [progress, setProgress] = useState<TourProgress>(() => readTourProgress());
  const cardRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const pulseTimer = useRef<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const doneFor = useRef<string | null>(null);
  // Which step+anchor the tour has already scrolled into view, so the
  // auto-scroll fires exactly once per step and never fights the
  // visitor's own scrolling afterwards.
  const scrolledForRef = useRef<string | null>(null);

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
  // instead of the tour, so the tour coach never sits over the open
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

  // Signed-in or demo? Read once from the Supabase session. No
  // Supabase on this copy means nobody is signed in. When the session
  // cannot be read, default to signed-in: the safe mode, where the
  // jobs step only ever asks to open a posting, never save a real job.
  useEffect(() => {
    if (!isConfigured()) {
      // No Supabase on this copy: nobody is signed in, and the
      // initial signedIn state is already false.
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setSignedIn(true);
    }, 2000);
    // The session read runs in a promise chain, so every setState
    // lands in an async callback, never synchronously in this effect.
    // A client that throws on construction is a rejection here, and
    // the catch defaults to the safe signed-in mode.
    Promise.resolve()
      .then(() => createClient().auth.getSession())
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.session);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(true);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // The spotlight target for this step. The jobs step spotlights the
  // save button on the demo and the posting link when signed in.
  const anchorName = step?.anchorAlt && signedIn ? step.anchorAlt : step?.anchor;

  // Write the ring's position straight to its element, bypassing
  // React state: this runs on every scroll frame, and a setState per
  // frame is what made scrolling feel glitchy (see the header
  // comment). React state only holds the rect for the initial render
  // and the settled placement on desktop.
  const applyRingRect = useCallback((r: { x: number; y: number; width: number; height: number }) => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.style.left = `${r.x - 8}px`;
    ring.style.top = `${r.y - 8}px`;
    ring.style.width = `${r.width + 16}px`;
    ring.style.height = `${r.height + 16}px`;
  }, []);

  // Keep the ring on the step's anchor and scroll the anchor into
  // view for the visitor. The scroll fires exactly once per step (a
  // mid-tour reload re-mounts, so it fires again there too), and the
  // visitor's own scrolling afterwards is never overridden. While the
  // page scrolls, the ring follows by direct DOM writes; React state
  // only updates once scrolling settles, for the desktop coach
  // placement. The anchor is retried while the page loads, so a
  // late-rendering target still gets scrolled to and ringed.
  useEffect(() => {
    if (!active || !step || !anchorName) return;
    let cancelled = false;
    let tries = 0;
    let raf = 0;
    let settleTimer: number | null = null;
    const key = `${step.id}:${anchorName}`;
    const scrollOnce = (el: Element) => {
      if (scrolledForRef.current === key) return;
      scrolledForRef.current = key;
      el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    };
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${anchorName}"]`);
      if (el) {
        scrollOnce(el);
        raf = requestAnimationFrame(() => {
          if (cancelled) return;
          const r = el.getBoundingClientRect();
          const next = { x: r.x, y: r.y, width: r.width, height: r.height };
          rectRef.current = next;
          applyRingRect(next);
          setRect(next);
        });
        return;
      }
      tries += 1;
      if (tries < 40) window.setTimeout(() => measure(), 100);
      else {
        // No anchor: no ring, and the card docks instead of keeping a
        // stale spot next to a feature that never showed up.
        rectRef.current = null;
        setRect(null);
        setPlacement(null);
      }
    };
    measure();
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (cancelled) return;
        const el = document.querySelector(`[data-tour="${anchorName}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const next = { x: r.x, y: r.y, width: r.width, height: r.height };
        rectRef.current = next;
        applyRingRect(next);
      });
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        if (cancelled || !rectRef.current) return;
        setRect(rectRef.current);
      }, SCROLL_SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [active, step, pathname, anchorName, applyRingRect]);

  // Move the coach next to the anchor instead of over it. The height is
  // measured from the live coach, never hard-coded. Phones keep the
  // bottom sheet, and a huge anchor falls back to the bottom dock.
  // Placement is computed from the settled rect only, never on every
  // scroll frame: the coach sits still while the visitor scrolls.
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
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, []);

  // The coach takes keyboard focus on each step so the tour works
  // without a mouse, and Escape exits from anywhere in the tour.
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

  // When a dialog opens over the page (the chat panel, a task drawer,
  // a lead or contact edit form), the coach collapses to a slim bar at
  // the top and the ring hides, so the dialog stays fully usable. The
  // tour's own coach is a dialog too, but it is never aria-modal, so
  // it never matches this check.
  useEffect(() => {
    if (!active) return;
    const check = () =>
      setOverlayOpen(!!document.querySelector('[role="dialog"][aria-modal="true"]'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [active]);

  // A step is done when the visitor does the real thing. The crystal
  // bursts, the ring pulses, and Pulse says the done line. The advance
  // itself lives in the effect below, so it can wait for a dialog to
  // close first. The step and its badge (when it earns one) are
  // recorded in localStorage, so a replay shows what was earned.
  const complete = useCallback(() => {
    if (!step || doneStep === step.id) return;
    setDoneStep(step.id);
    doneFor.current = step.id;
    setPulsing(true);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsing(false), 1200);
    const next = progressAfterCompletion(progress, step.id);
    setProgress(next);
    writeTourProgress(next);
  }, [step, doneStep, progress]);

  // Advance after a beat once the action lands, so the visitor sees
  // the real result (the row landing, the reply arriving) before the
  // page changes. Never while a dialog is open over the page: the
  // visitor reads the drawer or the edit form first, and the tour
  // moves on once it closes. The last step has no next step, so it
  // waits for Done instead. A dot jump or a browser Back clears the
  // pending timer through the cleanup, and the guard below is the
  // belt-and-braces for a timer that already fired.
  useEffect(() => {
    if (!done || !step) return;
    if (overlayOpen) return;
    const delay = reducedMotion() ? TOUR_ADVANCE_MS_REDUCED : TOUR_ADVANCE_MS;
    advanceTimer.current = window.setTimeout(() => {
      if (doneFor.current !== step.id) return;
      const next = nextTourStep(step);
      if (next) router.push(tourHref(next));
    }, delay);
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
  }, [done, overlayOpen, step, router]);

  // A new step clears the completion guard (a ref, not state, so this
  // effect never cascades a render). The pending advance timer checks
  // the guard before navigating.
  useEffect(() => {
    doneFor.current = null;
  }, [step?.id]);

  // Watch for the step's real action. These are observers only: the
  // tour never performs a mutation, it only notices when the visitor
  // does. Every detector is delegated from the document and scoped to
  // the step's own feature, so a click anywhere else on the page never
  // completes a step, and a target that renders after the tour mounts
  // (a mid-step reload, a slow deck) still completes when it is
  // finally tapped: the old shape attached listeners to elements
  // found once on mount, so a reload left the step deaf until the
  // visitor re-entered it through the dots.
  useEffect(() => {
    if (!active || !step || done) return;
    const cleanups: Array<() => void> = [];
    const on = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      cleanups.push(() => target.removeEventListener(type, fn));
    };
    const closest = (e: Event, sel: string): HTMLElement | null => {
      const t = e.target as HTMLElement | null;
      return t?.closest ? t.closest(sel) : null;
    };
    const within = (e: Event, sel: string): boolean => {
      const t = e.target as HTMLElement | null;
      return !!t?.closest?.(sel);
    };
    const buttonText = (el: HTMLElement | null) => (el?.textContent ?? "").trim();

    switch (step.completion) {
      case "waiting-open": {
        // Open a waiting task (the drawer is a preview) or expand the
        // list. Never Done: dismissing a real task is a mutation, and
        // the tour never asks for one.
        const fn = (e: Event) => {
          if (!within(e, '[data-tour="waiting"]')) return;
          if (closest(e, '[data-tour-action="waiting-open"], [data-tour-action="waiting-all"]')) complete();
        };
        on(document, "click", fn);
        break;
      }
      case "sheet-filter": {
        // Pick a stage in the status filter. On the demo, editing a
        // cell in the sheet table counts too (sample data only).
        const fn = (e: Event) => {
          if (!within(e, '[data-tour="sheet"]')) return;
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (t.getAttribute("aria-label") === "Filter by status") complete();
          else if (isDemoPath(pathname) && t.closest("table")) complete();
        };
        on(document, "change", fn);
        break;
      }
      case "jobs-search": {
        // Type in the search box, toggle a filter, or pick a track.
        const fn = (e: Event) => {
          if (!within(e, '[data-tour="find-jobs"]')) return;
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (e.type === "input" && t.id === "job-search") complete();
          else if (e.type === "change" && (t.tagName === "INPUT" || t.tagName === "SELECT")) complete();
          else if (e.type === "click") {
            const text = buttonText(closest(e, "button"));
            if (JOB_TRACK_FILTERS.includes(text)) complete();
          }
        };
        on(document, "input", fn);
        on(document, "change", fn);
        on(document, "click", fn);
        break;
      }
      case "jobs-save": {
        if (signedIn) {
          // Signed in: only ever open a posting to peek at it. The
          // deck's "View posting" link and the list view's "Open
          // posting" and title links are all external links.
          const fn = (e: Event) => {
            if (!within(e, '[data-tour="jobs"]')) return;
            if (closest(e, 'a[target="_blank"]')) complete();
          };
          on(document, "click", fn);
        } else {
          // Demo: tap the heart, swipe right, or press ArrowRight.
          // The save button click is the direct signal; the toast is
          // the catch-all for the swipe and keyboard paths, which
          // save through the same handler. The toast text is "Saved"
          // or "Saved <company> to your Leads".
          const fn = (e: Event) => {
            if (closest(e, '[data-tour="job-save"]')) complete();
          };
          on(document, "click", fn);
          const checkToast = () => {
            const toast = document.querySelector('[role="status"]');
            if (toast && (toast.textContent ?? "").trim().startsWith("Saved")) complete();
          };
          const obs = new MutationObserver(checkToast);
          obs.observe(document.body, { childList: true, subtree: true });
          cleanups.push(() => obs.disconnect());
          checkToast();
        }
        break;
      }
      case "lead-edit": {
        // Open a lead's detail form (a preview; the form itself is
        // never submitted by the tour). Any row's Edit counts; the
        // ring spotlights the first row's.
        const fn = (e: Event) => {
          if (!within(e, '[data-tour="leads"]')) return;
          const b = closest(e, "button");
          if (b && buttonText(b) === "Edit") complete();
        };
        on(document, "click", fn);
        break;
      }
      case "contact-edit": {
        // Open a due contact's drawer (a preview; nothing is sent).
        // Any row's Edit counts; the ring spotlights the first row's.
        const fn = (e: Event) => {
          if (!within(e, '[data-tour="networking"]')) return;
          const b = closest(e, "button");
          if (b && buttonText(b) === "Edit") complete();
        };
        on(document, "click", fn);
        break;
      }
      case "chat-ask": {
        // Ask one question in the chat panel: a user bubble appears.
        const check = () => {
          if (document.querySelector(".pf-chat-bubble-user-3d")) complete();
        };
        const obs = new MutationObserver(check);
        obs.observe(document.body, { childList: true, subtree: true });
        cleanups.push(() => obs.disconnect());
        check();
        break;
      }
      case "connect-copy": {
        // Copy the prompt (or the token or the snippet): copy is safe.
        const fn = (e: Event) => {
          const b = closest(e, "button");
          if (b && buttonText(b).startsWith("Copy")) complete();
        };
        on(document, "click", fn);
        break;
      }
    }
    return () => {
      cleanups.forEach((c) => c());
    };
  }, [active, step, signedIn, pathname, complete, done]);

  if (!active || !step) return null;
  // A dialog is open over the page: step aside entirely (see above).
  // The tour stays active in the URL and resumes when it closes.
  const compact = overlayOpen;
  if (compact) return null;
  const index = tourStepIndex(step);
  const last = index === TOUR_STEPS.length - 1;
  const line = done
    ? (signedIn && step.doneAlt ? step.doneAlt : step.done)
    : (signedIn && step.lineAlt ? step.lineAlt : step.line);
  const ringDash = tourRingDash(tourProgressFraction(progress));
  const earnedBadges = TOUR_BADGES.filter((b) => progress.badges.includes(b.id));
  const recap = tourRecapLines(progress.steps, signedIn);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-labelledby="tour-line">
      {rect && (
        <div
          ref={ringRef}
          className={`tour-ring${pulsing ? " tour-ring-pulse" : ""}`}
          aria-hidden="true"
          style={{ left: rect.x - 8, top: rect.y - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      <div
        key={step.id}
        ref={cardRef}
        tabIndex={-1}
        style={placement ? { left: placement.left, top: placement.top } : undefined}
        className={`tour-card tour-card-enter pointer-events-auto fixed max-h-[35dvh] overflow-y-auto rounded-2xl border border-line p-4 shadow-panel outline-none ${
          placement
            ? "inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-auto sm:right-auto sm:w-[380px]"
            : "inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="tour-crystal-wrap relative h-14 w-14 shrink-0" aria-hidden="true">
            <svg
              className="tour-progress-ring pointer-events-none absolute inset-0 h-14 w-14 -rotate-90"
              viewBox="0 0 56 56"
              role="img"
              aria-label={`${progress.steps.length} of ${TOUR_STEPS.length} steps done`}
            >
              <circle cx="28" cy="28" r={TOUR_RING_RADIUS} className="tour-progress-ring-track" />
              <circle
                cx="28"
                cy="28"
                r={TOUR_RING_RADIUS}
                className="tour-progress-ring-fill"
                strokeDasharray={ringDash.dasharray}
                strokeDashoffset={ringDash.dashoffset}
              />
            </svg>
            <span className="tour-crystal-halo pointer-events-none absolute inset-0" />
            <span className={`tour-crystal absolute inset-1 flex items-center justify-center ${done ? "tour-crystal-burst" : ""}`}>
              <PulseCrystal className="h-12 w-12" />
            </span>
          </span>
          <p id="tour-line" className="tour-bubble min-w-0 flex-1 text-sm leading-relaxed text-ink">
            {line}
          </p>
          <button
            onClick={exit}
            aria-label="Exit tour"
            className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        {earnedBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Badges earned by doing the tour steps">
            {earnedBadges.map((badge) => {
              const isNew = done && badgeForStep(step.id)?.id === badge.id;
              return (
                <span key={badge.id} className={`tour-badge${isNew ? " tour-badge-pop" : ""}`}>
                  {badge.name}
                </span>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => router.push(tourHref(s))}
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              className={`h-1.5 flex-1 rounded-full transition ${
                i === index ? "bg-accent" : i < index ? "bg-accent/40" : "bg-line"
              }`}
            />
          ))}
          <span className="ml-1 shrink-0 font-mono text-[11px] text-faint">
            {index + 1}/{TOUR_STEPS.length}
          </span>
        </div>
        {done && last && (
          <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-xs font-semibold text-ink">
              {progress.steps.length === TOUR_STEPS.length ? "You did all of it" : "Here is what you did"}
            </p>
            <ul className="mt-1.5 space-y-1">
              {recap.map((r) => (
                <li key={r} className="text-xs text-muted">
                  ✓ {r}
                </li>
              ))}
            </ul>
            {earnedBadges.length > 0 && (
              <p className="mt-2 text-xs text-muted">Badges: {earnedBadges.map((b) => b.name).join(", ")}</p>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {done && last ? (
            <button
              onClick={exit}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-panel transition hover:brightness-110"
            >
              Done
            </button>
          ) : (
            <button onClick={exit} className="text-sm font-medium text-muted transition hover:text-ink">
              Skip tour
            </button>
          )}
          <p className="text-xs text-faint">{done ? "Moving on" : "Do the thing and the tour moves on"}</p>
        </div>
      </div>
    </div>
  );
}

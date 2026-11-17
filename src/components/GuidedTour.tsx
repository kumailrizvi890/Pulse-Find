"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isDemoPath,
  nextTourStep,
  parseTourStep,
  placeTourCard,
  tourHref,
  tourStartHref,
  TOUR_ADVANCE_MS,
  TOUR_ADVANCE_MS_REDUCED,
  TOUR_DISMISSED_KEY,
  TOUR_STEPS,
  tourStepIndex,
  type CardPlacement,
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
  // Which step Pulse has already cheered for. Derived from the step,
  // so moving to another step (a dot, the advance, browser Back)
  // resets it without an effect: the render adjustment below clears
  // it the moment the step id changes.
  const [doneStep, setDoneStep] = useState<string | null>(null);
  const [prevStepId, setPrevStepId] = useState<string | undefined>(step?.id);
  if (step?.id !== prevStepId) {
    setPrevStepId(step?.id);
    setDoneStep(null);
  }
  const done = doneStep === step?.id;
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const pulseTimer = useRef<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const doneFor = useRef<string | null>(null);

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

  // Keep the ring on the step's anchor: measure after navigation and
  // again while the page settles, then follow scrolls and resizes.
  useEffect(() => {
    if (!active || !step || !anchorName) return;
    let cancelled = false;
    let tries = 0;
    let raf = 0;
    const measure = (scroll: boolean) => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${anchorName}"]`);
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
  }, [active, step, pathname, anchorName]);

  // Move the coach next to the anchor instead of over it. The height is
  // measured from the live coach, never hard-coded. Phones keep the
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
  // close first.
  const complete = useCallback(() => {
    if (!step || doneStep === step.id) return;
    setDoneStep(step.id);
    doneFor.current = step.id;
    setPulsing(true);
    if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulsing(false), 1200);
  }, [step, doneStep]);

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
  // does. Each detector is scoped to the step's own feature, so a
  // click anywhere else on the page never completes a step.
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
    const buttonText = (el: HTMLElement | null) => (el?.textContent ?? "").trim();

    switch (step.completion) {
      case "waiting-open": {
        // Open a waiting task (the drawer is a preview) or expand the
        // list. Never Done: dismissing a real task is a mutation, and
        // the tour never asks for one.
        const anchor = document.querySelector('[data-tour="waiting"]');
        if (!anchor) break;
        const fn = (e: Event) => {
          if (closest(e, '[data-tour-action="waiting-open"], [data-tour-action="waiting-all"]')) complete();
        };
        on(anchor, "click", fn);
        break;
      }
      case "sheet-filter": {
        // Pick a stage in the status filter. On the demo, editing a
        // cell in the sheet table counts too (sample data only).
        const sheet = document.querySelector('[data-tour="sheet"]');
        if (!sheet) break;
        const fn = (e: Event) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (t.getAttribute("aria-label") === "Filter by status") complete();
          else if (isDemoPath(pathname) && t.closest("table")) complete();
        };
        on(sheet, "change", fn);
        break;
      }
      case "jobs-search": {
        // Type in the search box, toggle a filter, or pick a track.
        const anchor = document.querySelector('[data-tour="find-jobs"]');
        if (!anchor) break;
        const fn = (e: Event) => {
          const t = e.target as HTMLElement | null;
          if (!t) return;
          if (e.type === "input" && t.id === "job-search") complete();
          else if (e.type === "change" && (t.tagName === "INPUT" || t.tagName === "SELECT")) complete();
          else if (e.type === "click") {
            const text = buttonText(closest(e, "button"));
            if (JOB_TRACK_FILTERS.includes(text)) complete();
          }
        };
        on(anchor, "input", fn);
        on(anchor, "change", fn);
        on(anchor, "click", fn);
        break;
      }
      case "jobs-save": {
        if (signedIn) {
          // Signed in: only ever open a posting to peek at it. The
          // deck's "View posting" link and the list view's "Open
          // posting" and title links are all external links.
          const board = document.querySelector('[data-tour="jobs"]');
          if (!board) break;
          const fn = (e: Event) => {
            if (closest(e, 'a[target="_blank"]')) complete();
          };
          on(board, "click", fn);
        } else {
          // Demo: tap the heart, swipe right, or press ArrowRight.
          // The save button click is the direct signal; the toast is
          // the catch-all for the swipe and keyboard paths, which
          // save through the same handler. The toast text is "Saved"
          // or "Saved <company> to your Leads".
          const save = document.querySelector('[data-tour="job-save"]');
          if (save) on(save, "click", () => complete());
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
        const section = document.querySelector('[data-tour="leads"]');
        if (!section) break;
        const fn = (e: Event) => {
          const b = closest(e, "button");
          if (b && buttonText(b) === "Edit") complete();
        };
        on(section, "click", fn);
        break;
      }
      case "contact-edit": {
        // Open a due contact's drawer (a preview; nothing is sent).
        // Any row's Edit counts; the ring spotlights the first row's.
        const section = document.querySelector('[data-tour="networking"]');
        if (!section) break;
        const fn = (e: Event) => {
          const b = closest(e, "button");
          if (b && buttonText(b) === "Edit") complete();
        };
        on(section, "click", fn);
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

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-labelledby="tour-line">
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
        className={`tour-card pointer-events-auto fixed max-h-[35dvh] overflow-y-auto rounded-2xl border border-line p-4 shadow-panel outline-none ${
          placement
            ? "inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-auto sm:right-auto sm:w-[380px]"
            : "inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]"
        }`}
      >
        <div className="flex items-start gap-3">
          <span className={`tour-crystal shrink-0 ${done ? "tour-crystal-burst" : ""}`} aria-hidden="true">
            <PulseCrystal className="h-12 w-12" />
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
        <div className="mt-3 flex gap-1.5" aria-label={`Step ${index + 1} of ${TOUR_STEPS.length}`}>
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
        </div>
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
          <p className="text-xs text-faint">{done ? "moving on" : "do the thing and the tour moves on"}</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { answerGeneralQuestion, DEFAULT_APP_ORIGIN, type GeneralChatContext } from "@/lib/task-chat";
import { demoApplications, demoEvents } from "@/lib/demo-data";
import { demoContacts } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";
import { nextTourStep, parseTourStep, prevTourStep, tourHref, tourStepIndex, TOUR_STEPS } from "@/lib/guided-tour";
import { PulseDot } from "@/components/PulseBrand";
import { IconX } from "@/components/icons";

// The tour runs on the public demo routes only, driven by ?tour=<step>.
// It renders nothing anywhere else, and nothing when the param is absent.
// Each step navigates to its route, spotlights the step's data-tour
// anchor with a ring, and narrates in the card below. The visitor can
// go back a step, skip the whole tour, or exit at any time (Escape too).
// The ring is positioned from the anchor's live bounding box and re-measured
// on scroll and resize, so it stays glued to the feature. If an anchor
// never appears (a slow load, the list view on /jobs), the card still
// shows and the tour still works, just without the ring.

const TOUR_ROUTES = ["/demo", "/demo/sheet", "/demo/leads", "/demo/networking", "/demo/connect", "/jobs"];

const CHAT_QUESTION = "What networking follow-ups are due?";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function GuidedTour() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const step = parseTourStep(searchParams.get("tour"));
  const active = step !== null && TOUR_ROUTES.includes(pathname);
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const exit = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

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
      else setRect(null);
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
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{ left: rect.x - 8, top: rect.y - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="fixed inset-x-3 bottom-3 rounded-2xl border border-line bg-surface p-5 shadow-panel outline-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px]"
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
              <Link href="/demo?chat=1" className="text-sm font-semibold text-accent">
                Try Ask Pulse yourself →
              </Link>
            </p>
          </div>
        )}
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

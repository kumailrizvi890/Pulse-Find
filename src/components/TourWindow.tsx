"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { SwipeDeck, hue, initials, type DeckJob } from "@/app/jobs/SwipeDeck";
import { PulseCrystal, PulseDot } from "@/components/PulseBrand";
import { IconX } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/env";
import {
  ensureInstallPromptListener,
  getInstallPrompt,
  isIOSDevice,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/install-prompt";
import { readJobPicks, removeJobPick, writeJobPicks } from "@/lib/job-picks";
import { withLoadTimeout } from "@/lib/load-timeout";
import {
  OPEN_TOUR_EVENT,
  TOUR_CLOSE_EVENT,
  TOUR_CONFETTI_COLORS,
  TOUR_CONFETTI_COUNT,
  TOUR_CONNECT_HREF,
  TOUR_DECK_CLEARED_BUBBLE,
  TOUR_DECK_SIZE,
  TOUR_JOBS_COLS,
  TOUR_JOBS_STEP,
  TOUR_OPEN_EVENT,
  TOUR_SPARK_COUNT,
  TOUR_SPARK_GLYPHS,
  TOUR_STEPS,
  TOUR_TOTAL_STEPS,
  TOUR_WINDOW_TITLE,
  badgeSwipeText,
  buildTourQueue,
  deckDecideBubble,
  deckDoneText,
  isTourDone,
  markTourDone,
  shouldAutoStartTour,
} from "@/lib/tour-window";

// The tour window (Nov 19 2026 redesign): Pulse tours a new visitor
// around in one small draggable window, 8 stops, tap Next to advance.
// Only the jobs stop asks for a real action: the real swipe deck, and
// its saves always go through the demo/local job picks, never through
// Supabase, so the tour never touches real user data — a saved tour
// job lands in the demo Leads the same way a board save does.
//
// Auto-start is front-door only, signed-out only, and once only: a
// visitor who finishes or dismisses (X/Escape) is never gated again.
// Signed-in visitors never see the gate. Manual open (the demo nav's
// "Take the tour") works from any demo page, even signed in, and the
// tour still runs in demo mode. The backdrop never closes the tour on
// click, and closing removes everything the tour added: the overlay
// unmounts and the body scroll lock is restored, so the page looks
// exactly as it did before. The tour window is the only new surface:
// nothing else on the page is restyled.
//
// The "Get the app" row in the footer (steps 1-7, never the finale)
// is the tour's visible install step. The title bar is too cramped at
// phone width, so it lives in the footer instead. It calls the shared
// captured prompt on tap, never auto-fires it; on iOS it opens the
// Add to Home Screen guide inside the window.

type Decision = { job: DeckJob; choice: "saved" | "hidden"; wasAlreadySaved: boolean };

type Spark = { id: number; left: number; top: number; sx: number; sy: number; glyph: string };

const ECG_PATH =
  "M0 13 H180 l10 0 8-9 12 18 8-13 6 4 H330 l10 0 8-9 12 18 8-13 6 4 H480 l10 0 8-9 12 18 8-13 6 4 H600";

/** A button that does nothing must never look bright: decorative
    panel buttons (Open, Export .xlsx, Talk to Agent, Open Sheet view)
    are ghost-style, muted, and disabled, with aria-disabled and
    tabindex -1 so keyboard users skip them too. */
const DECORATIVE_BTN =
  "rounded-lg border border-line bg-transparent px-3.5 py-2 text-[13px] font-bold text-muted opacity-60";

function Chip({ tone, children }: { tone: "applied" | "oa" | "interview" | "saved" | "new"; children: ReactNode }) {
  const tones: Record<Exclude<typeof tone, "new">, string> = {
    applied: "border-accent/30 bg-accent-soft text-accent",
    oa: "border-warn/30 bg-warn-soft text-warn",
    interview: "border-good/30 bg-good-soft text-good",
    saved: "border-good/30 bg-good-soft text-good",
  };
  const style =
    tone === "new"
      ? ({ background: "rgba(88,140,255,.16)", color: "#9db9ff", borderColor: "rgba(88,140,255,.35)" } as CSSProperties)
      : undefined;
  return (
    <span
      style={style}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-extrabold ${tone === "new" ? "" : tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Tile({ letter, bg }: { letter: string; bg: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: bg }}
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] font-display text-[15px] font-extrabold text-white"
    >
      {letter}
    </span>
  );
}

function MockPanel({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3.5">
      <h3 className="font-display text-[14.5px] font-bold">{title}</h3>
      {sub ? <p className="mt-0.5 text-[13px] text-faint">{sub}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function MockRow({
  tile,
  title,
  sub,
  right,
}: {
  tile: ReactNode;
  title: string;
  sub: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      {tile}
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-bold leading-snug">{title}</b>
        <span className="text-[12.5px] text-faint">{sub}</span>
      </div>
      {right}
    </div>
  );
}

function Stat({ value, label, hot }: { value: string; label: string; hot?: boolean }) {
  return (
    <div className="rounded-[11px] border border-line bg-surface p-2.5">
      <b className={`block font-display text-[21px] font-extrabold leading-none ${hot ? "text-accent" : ""}`}>{value}</b>
      <span className="mt-1 block text-[11.5px] font-bold text-faint">{label}</span>
    </div>
  );
}

export function TourWindow() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [deckQueue, setDeckQueue] = useState<DeckJob[]>([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckRound, setDeckRound] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [installMode, setInstallMode] = useState<"hidden" | "install" | "ios">("hidden");
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<
    { left: number; background: string; duration: number; delay: number; rotate: number }[]
  >([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const sparkId = useRef(0);
  const autoChecked = useRef(false);

  const isFinale = step === TOUR_TOTAL_STEPS;
  const deckCleared = decisions.length >= TOUR_DECK_SIZE;
  const savedJobs = useMemo(() => decisions.filter((d) => d.choice === "saved").map((d) => d.job), [decisions]);
  const savedCount = savedJobs.length;
  const lastDecision = decisions[decisions.length - 1];
  const nextEnabled = step < TOUR_TOTAL_STEPS && !(step === TOUR_JOBS_STEP && !deckCleared);

  const bubble =
    step === TOUR_JOBS_STEP && deckCleared
      ? TOUR_DECK_CLEARED_BUBBLE
      : step === TOUR_JOBS_STEP && lastDecision
        ? deckDecideBubble(lastDecision.choice, TOUR_DECK_SIZE - decisions.length)
        : { title: TOUR_STEPS[step - 1].bubbleTitle, text: TOUR_STEPS[step - 1].bubbleText };

  const closeTour = useCallback(() => {
    markTourDone();
    setOpen(false);
    window.dispatchEvent(new CustomEvent(TOUR_CLOSE_EVENT));
  }, []);

  const openTour = useCallback(() => {
    setStep(1);
    setDecisions([]);
    setDeckRound((r) => r + 1);
    setDeckLoading(true);
    setDeckQueue([]);
    setOffset({ x: 0, y: 0 });
    setAnimDone(false);
    setInstallGuideOpen(false);
    setOpen(true);
    window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT));
  }, []);

  const goTo = useCallback(
    (n: number) => {
      if (n < 1 || n > TOUR_TOTAL_STEPS) return;
      // Never forward past the jobs stop until the deck is cleared.
      if (n > TOUR_JOBS_STEP && !deckCleared) return;
      if (n === TOUR_TOTAL_STEPS && !reducedMotion) {
        setConfettiPieces(
          Array.from({ length: TOUR_CONFETTI_COUNT }, (_, i) => ({
            left: Math.random() * 100,
            background: TOUR_CONFETTI_COLORS[i % TOUR_CONFETTI_COLORS.length],
            duration: 1.6 + Math.random() * 1.6,
            delay: Math.random() * 0.5,
            rotate: Math.random() * 180,
          })),
        );
      }
      setStep(n);
    },
    [deckCleared, reducedMotion],
  );

  // Auto-start, once per mount: front door only, signed-out only, and
  // never when the tour is already done. The session read has a ~2s
  // timeout and defaults to signed-in (safe mode), so an unsure check
  // never gates anyone. No Supabase on this copy means nobody is
  // signed in.
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    const completed = isTourDone();
    if (pathname !== "/" || completed) return;
    const decide = (signedIn: boolean) => {
      if (shouldAutoStartTour({ signedIn, completed, pathname })) openTour();
    };
    if (!isConfigured()) {
      decide(false);
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        decide(true);
      }
    }, 2000);
    Promise.resolve()
      .then(() => createClient().auth.getSession())
      .then(({ data }) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          decide(!!data.session);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          decide(true);
        }
      });
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, openTour]);

  // Manual open from anywhere (the demo nav's "Take the tour"): opens
  // at step 1 and rebuilds the deck, even for signed-in visitors, and
  // the tour still runs in demo mode.
  useEffect(() => {
    const onOpen = () => openTour();
    window.addEventListener(OPEN_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
  }, [openTour]);

  // While open: lock body scroll, focus the dialog, and restore the
  // scroll lock on close so the page looks exactly as it did before.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  // Reaching the finale counts as done, so a visitor who got this far
  // is never gated again.
  useEffect(() => {
    if (open && isFinale) markTourDone();
  }, [open, isFinale]);

  // Keyboard: arrows move between stops (never past a locked Next),
  // Escape closes. While the deck is up and Next is locked, ArrowRight
  // does nothing here: the deck's own arrow keys still save/pass
  // cards, which is the deck's existing behavior.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeTour();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "ArrowRight" && nextEnabled) goTo(step + 1);
      else if (e.key === "ArrowLeft" && step > 1) goTo(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, nextEnabled, goTo, closeTour]);

  // The tour deck: the same query as the jobs board (active, Internship
  // track, tech, newest first, 3). Unconfigured, failed, or short
  // feeds fall back to the fictional jobs, topped up to 3.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      let live: DeckJob[] = [];
      if (isConfigured()) {
        try {
          const supabase = createClient();
          const res = await withLoadTimeout(
            supabase
              .from("jobs")
              .select(TOUR_JOBS_COLS)
              .eq("active", true)
              .eq("track", "Internship")
              .eq("tech", true)
              .order("posted_at", { ascending: false, nullsFirst: false })
              .limit(TOUR_DECK_SIZE),
            8000,
            "Tour jobs took too long to load.",
          );
          if (!res.error && res.data && res.data.length > 0) live = res.data as DeckJob[];
        } catch {
          live = [];
        }
      }
      if (!alive) return;
      setDeckQueue(buildTourQueue(live));
      setDeckLoading(false);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [open, deckRound]);

  // Install: the shared captured prompt (or iOS) decides whether the
  // "Get the app" row shows. The prompt is never auto-fired.
  useEffect(() => {
    ensureInstallPromptListener();
    const sync = () => {
      if (getInstallPrompt()) setInstallMode("install");
      else if (isIOSDevice()) setInstallMode("ios");
      else setInstallMode("hidden");
    };
    sync();
    return subscribeInstallPrompt(sync);
  }, []);

  const burst = useCallback(() => {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 650);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const next = Array.from({ length: TOUR_SPARK_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 34 + Math.random() * 30;
      return {
        id: sparkId.current++,
        left: 22 + Math.random() * 20,
        top: 18 + Math.random() * 18,
        sx: Math.cos(angle) * dist,
        sy: Math.sin(angle) * dist - 14,
        glyph: TOUR_SPARK_GLYPHS[Math.floor(Math.random() * TOUR_SPARK_GLYPHS.length)],
      };
    });
    setSparks((prev) => [...prev, ...next]);
    window.setTimeout(() => {
      setSparks((prev) => prev.filter((s) => !next.some((n) => n.id === s.id)));
    }, 750);
  }, []);

  const handleDecide = (job: DeckJob, choice: "saved" | "hidden") => {
    let wasAlreadySaved = false;
    if (choice === "saved") {
      // Always the demo/local path: a saved tour job lands in the demo
      // Leads, and the tour never writes to Supabase, even signed in.
      const picks = readJobPicks();
      wasAlreadySaved = job.id in picks.saved;
      writeJobPicks(
        { ...picks.marks, [job.id]: "saved" },
        { ...picks.saved, [job.id]: job },
      );
    }
    const next = [...decisions, { job, choice, wasAlreadySaved }];
    setDecisions(next);
    setDeckQueue((q) => q.slice(1));
    if (next.length >= TOUR_DECK_SIZE) burst();
  };

  const handleUndo = () => {
    const last = decisions[decisions.length - 1];
    if (!last) return;
    // Only forget a pick the tour itself added: a job saved on the
    // board before the tour stays saved.
    if (last.choice === "saved" && !last.wasAlreadySaved) removeJobPick(last.job.id);
    setDecisions(decisions.slice(0, -1));
    setDeckQueue([last.job, ...deckQueue]);
  };

  const handleDetails = (job: DeckJob) => {
    if (!job.url) return;
    window.open(job.url, "_blank", "noopener,noreferrer");
  };

  const onGetApp = async () => {
    if (installMode === "ios") {
      setInstallGuideOpen(true);
      return;
    }
    await promptInstall();
  };

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    setAnimDone(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    setOffset((prev) => ({
      x: Math.max(-160, Math.min(160, prev.x + (e.clientX - start.x))),
      y: Math.max(-60, Math.min(120, prev.y + (e.clientY - start.y))),
    }));
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const renderStage = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-3">
            <MockPanel title="Your search, at a glance" sub="Your morning snapshot. No tabs, no chaos.">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat value="18" label="Fresh leads today" hot />
                <Stat value="42" label="Applications tracked" />
                <Stat value="6" label="At OA stage" />
                <Stat value="3" label="Interviews live" />
              </div>
            </MockPanel>
            <MockPanel title="Momentum, not chaos" sub="See what moved, instantly.">
              <MockRow
                tile={<Tile letter="S" bg="#3b5bdb" />}
                title="Software Engineer Intern"
                sub="Stripe · Seattle, WA"
                right={<Chip tone="interview">Interview</Chip>}
              />
              <MockRow
                tile={<Tile letter="D" bg="#0f766e" />}
                title="AI Engineering Intern"
                sub="Databricks · Remote"
                right={<Chip tone="oa">OA sent</Chip>}
              />
              <MockRow
                tile={<Tile letter="F" bg="#7c3aed" />}
                title="Frontend Intern"
                sub="Figma · San Francisco, CA"
                right={<Chip tone="applied">Applied</Chip>}
              />
            </MockPanel>
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-warn/45 bg-warn-soft/40 p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-warn-soft" aria-hidden="true">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                    stroke="#ffc766"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <b className="text-[14.5px]">Waiting on you: 2 things</b>
                <p className="mt-0.5 text-[13.5px] text-muted">OA due Friday + 1 quick answer. Needs-you stuff always floats up.</p>
              </div>
              <button type="button" className={DECORATIVE_BTN} disabled aria-disabled="true" tabIndex={-1}>
                Open
              </button>
            </div>
            <MockPanel title="One home for everything" sub="Everything behind one dashboard.">
              <MockRow
                tile={<Tile letter="L" bg="#c21727" />}
                title="Leads"
                sub="Fresh roles matched to you, newest first"
                right={<span className="text-[12px] font-bold text-faint">18 new</span>}
              />
              <MockRow
                tile={<Tile letter="T" bg="#2563eb" />}
                title="Tracker"
                sub="Every application and its stage"
                right={<span className="text-[12px] font-bold text-faint">42 rows</span>}
              />
              <MockRow
                tile={<Tile letter="N" bg="#0f766e" />}
                title="Networking"
                sub="People to reach out to, and who replied"
                right={<span className="text-[12px] font-bold text-faint">64% response</span>}
              />
              <MockRow
                tile={<Tile letter="F" bg="#9333ea" />}
                title="Files"
                sub="Resume and trackers, one click away"
                right={<span className="text-[12px] font-bold text-faint">Synced</span>}
              />
            </MockPanel>
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <MockPanel title="Fresh roles, served daily" sub="Fits your level. Newest first. Apply fast.">
              <MockRow
                tile={<Tile letter="R" bg="#e8590c" />}
                title="Software Engineering Intern, Summer 2027"
                sub="Reddit · Remote"
                right={<Chip tone="new">3h ago</Chip>}
              />
              <MockRow
                tile={<Tile letter="C" bg="#1971c2" />}
                title="Machine Learning Intern"
                sub="Coinbase · Seattle, WA"
                right={<Chip tone="new">7h ago</Chip>}
              />
              <MockRow
                tile={<Tile letter="D" bg="#2f9e44" />}
                title="New Grad Software Engineer"
                sub="Duolingo · Pittsburgh, PA"
                right={<Chip tone="new">12h ago</Chip>}
              />
              <MockRow
                tile={<Tile letter="A" bg="#862e9c" />}
                title="Product Engineering Intern"
                sub="Airtable · San Francisco, CA"
                right={<Chip tone="new">1d ago</Chip>}
              />
            </MockPanel>
            <MockPanel title="One tap = tracked" sub="Hit Applied, it's in your tracker. No copy-paste." />
          </div>
        );
      case 4:
        return deckCleared ? (
          <div className="px-2 py-5 text-center">
            <h3 className="font-display text-[19px] font-bold">Deck cleared. Nice swiping!</h3>
            <p className="mx-auto mt-2 max-w-[400px] text-sm text-muted">{deckDoneText(savedCount)}</p>
            {savedJobs.length > 0 && (
              <div className="mt-3 text-left">
                {savedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <Tile letter={initials(job.company)} bg={`hsl(${hue(job.company)} 65% 42%)`} />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-bold leading-snug">{job.title}</b>
                      <span className="text-[12.5px] text-faint">
                        {job.company} · {job.location}
                      </span>
                    </div>
                    <Chip tone="saved">In your Leads</Chip>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <SwipeDeck
            queue={deckQueue}
            loading={deckLoading}
            onDecide={handleDecide}
            onUndo={handleUndo}
            canUndo={decisions.length > 0}
            emptyText="Deck cleared."
            onDetails={handleDetails}
          />
        );
      case 5:
        return (
          <div className="space-y-3">
            <MockPanel title="Every application, one clean list" sub="Red = Applied, Amber = OA, Green = Interview.">
              {[
                { company: "Stripe", role: "Software Engineer Intern", when: "Nov 12", chip: <Chip tone="interview">Interview</Chip> },
                { company: "Databricks", role: "AI Engineering Intern", when: "Nov 14", chip: <Chip tone="oa">OA</Chip> },
                { company: "Epic Systems", role: "Software Developer", when: "Nov 15", chip: <Chip tone="interview">Interview</Chip> },
                { company: "Figma", role: "Frontend Intern", when: "Nov 16", chip: <Chip tone="applied">Applied</Chip> },
                { company: "Coinbase", role: "Machine Learning Intern", when: "Nov 17", chip: <Chip tone="applied">Applied</Chip> },
              ].map((row) => (
                <div
                  key={row.company}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-line py-2.5 first:border-t-0 first:pt-0 last:pb-0 max-sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <b className="block text-[14px] font-bold">{row.company}</b>
                    <span className="text-[12px] text-faint">{row.role}</span>
                  </div>
                  <span className="text-[12px] font-bold text-faint max-sm:hidden">{row.when}</span>
                  {row.chip}
                </div>
              ))}
            </MockPanel>
            <MockPanel title="It is also a real spreadsheet" sub="Sort, filter, edit — then export anytime.">
              <div className="flex flex-wrap gap-2">
                <button type="button" className={DECORATIVE_BTN} disabled aria-disabled="true" tabIndex={-1}>
                  Open Sheet view
                </button>
                <button type="button" className={DECORATIVE_BTN} disabled aria-disabled="true" tabIndex={-1}>
                  Export .xlsx
                </button>
              </div>
            </MockPanel>
          </div>
        );
      case 6:
        return (
          <div className="space-y-3">
            <MockPanel title="People, not just postings" sub="Recruiters, engineers, alumni — lined up for you.">
              <MockRow
                tile={
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#3b5bdb] text-[13px] font-extrabold text-white" aria-hidden="true">
                    AR
                  </span>
                }
                title="Alicia R."
                sub="University Recruiter · Stripe"
                right={<Chip tone="saved">Connected</Chip>}
              />
              <MockRow
                tile={
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#0f766e] text-[13px] font-extrabold text-white" aria-hidden="true">
                    JM
                  </span>
                }
                title="Jordan M."
                sub="Software Engineer, UW alum · Databricks"
                right={<Chip tone="oa">Replied</Chip>}
              />
              <MockRow
                tile={
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#862e9c] text-[13px] font-extrabold text-white" aria-hidden="true">
                    PK
                  </span>
                }
                title="Priya K."
                sub="Hiring Manager · Figma"
                right={<Chip tone="new">Reach out next</Chip>}
              />
            </MockPanel>
            <MockPanel title="Response rate, honestly counted" sub="Connects + replies count. Same number everywhere.">
              <div className="flex items-baseline gap-2.5">
                <b className="font-display text-[24px] font-extrabold">64%</b>
                <span className="text-[12.5px] font-bold text-faint">got a real response</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <i className="block h-full rounded-full bg-gradient-to-r from-[#1d9e5f] to-[#2fbf71]" style={{ width: "64%" }} />
              </div>
            </MockPanel>
          </div>
        );
      case 7:
        return (
          <div className="space-y-3">
            <MockPanel title="Bring your own AI agent" sub="Your AI can read, add, and update everything via MCP.">
              <div className="flex flex-wrap gap-2">
                {["Claude Code", "Cursor", "Copilot", "Any MCP client"].map((name) => (
                  <span key={name} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold">
                    {name}
                  </span>
                ))}
              </div>
            </MockPanel>
            <MockPanel title="Stuck? Talk to Agent" sub="Ask Pulse, tap once, your agent takes it.">
              <div className="rounded-xl border border-[#1d2a45] bg-[#0a0f1c] p-3 text-[13.5px]">
                <div className="mb-1.5 text-[11.5px] font-extrabold tracking-[0.08em] text-faint">
                  HANDOFF PROMPT, READY TO PASTE
                </div>
                <code className="break-all font-mono text-[12.5px] text-[#9db9ff]">
                  Set up my dashboard, refresh my leads, clear my 2 tasks…
                </code>
              </div>
              <button type="button" className={`${DECORATIVE_BTN} mt-3`} disabled aria-disabled="true" tabIndex={-1}>
                Talk to Agent
              </button>
            </MockPanel>
          </div>
        );
      case 8:
        return (
          <div className="relative px-1 py-2 text-center">
            <div className="pf-tour-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              {confettiPieces.map((piece, i) => (
                <i
                  key={i}
                  style={{
                    left: `${piece.left}%`,
                    background: piece.background,
                    animationDuration: `${piece.duration}s`,
                    animationDelay: `${piece.delay}s`,
                    transform: `rotate(${piece.rotate}deg)`,
                  }}
                />
              ))}
            </div>
            <h3 className="font-display text-[23px] font-extrabold tracking-[-0.01em]">Boom. Tour done!</h3>
            <p className="mx-auto mt-1.5 max-w-[440px] text-[14.5px] text-muted">8 stops. 1 swipe deck. Zero homework.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <div className="pf-tour-badge w-[128px] rounded-[14px] border border-line bg-surface-2 px-2.5 py-3">
                <span className="mx-auto mb-2 flex h-[42px] w-[42px] items-center justify-center rounded-full border border-accent/40 bg-accent-soft" aria-hidden="true">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 12h4l2.5-6 4 12L16 12h5" stroke="#ff97a3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <b className="block text-[13.5px]">Met Pulse</b>
                <span className="text-[12px] text-faint">Your guide, always on</span>
              </div>
              <div className="pf-tour-badge w-[128px] rounded-[14px] border border-line bg-surface-2 px-2.5 py-3" style={{ animationDelay: ".12s" }}>
                <span className="mx-auto mb-2 flex h-[42px] w-[42px] items-center justify-center rounded-full border border-accent/40 bg-accent-soft" aria-hidden="true">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" stroke="#ff97a3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <b className="block text-[13.5px]">Master Swiper</b>
                <span className="text-[12px] text-faint">{badgeSwipeText(savedCount)}</span>
              </div>
              <div className="pf-tour-badge w-[128px] rounded-[14px] border border-line bg-surface-2 px-2.5 py-3" style={{ animationDelay: ".24s" }}>
                <span className="mx-auto mb-2 flex h-[42px] w-[42px] items-center justify-center rounded-full border border-accent/40 bg-accent-soft" aria-hidden="true">
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 3l2.1 5.3L20 9l-4.2 3.8L17 18.5 12 15.7 7 18.5l1.2-5.7L4 9l5.9-.7L12 3Z"
                      stroke="#ff97a3"
                      strokeWidth="1.9"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <b className="block text-[13.5px]">Tour Complete</b>
                <span className="text-[12px] text-faint">All 8 stops visited</span>
              </div>
            </div>
            <ul className="mx-auto mt-4 max-w-[470px] pl-5 text-left">
              <li className="mb-1.5 text-sm text-muted">
                <b className="text-ink">Dashboard</b> — everything, refreshed daily.
              </li>
              <li className="mb-1.5 text-sm text-muted">
                <b className="text-ink">Leads + swipe</b> — fresh fits, saved in one tap.
              </li>
              <li className="mb-1.5 text-sm text-muted">
                <b className="text-ink">Tracker + people</b> — every stage, every reply.
              </li>
              <li className="mb-1.5 text-sm text-muted">
                <b className="text-ink">Your agent</b> — connect once, it does the busywork.
              </li>
            </ul>
            <div className="mt-5 flex justify-center">
              <a
                href={TOUR_CONNECT_HREF}
                onClick={closeTour}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accent px-5 text-[15px] font-extrabold text-accent-ink shadow-[0_6px_22px_rgba(253,88,93,0.35)] transition hover:brightness-110"
              >
                Connect
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!open) return null;

  const stepDef = TOUR_STEPS[step - 1];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-tour-bubble-title"
        tabIndex={-1}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) setAnimDone(true);
        }}
        className={`pf-tour-window relative flex max-h-[92dvh] w-full max-w-[600px] flex-col outline-none ${animDone ? "" : "pf-tour-winpop"} ${dragging ? "pf-tour-dragging" : ""}`}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none select-none items-center gap-2.5 border-b border-line bg-surface-2 px-3.5 py-2.5 active:cursor-grabbing"
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag me"
        >
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            <i className="block h-3 w-3 rounded-full bg-[#ff5f57]" />
            <i className="block h-3 w-3 rounded-full bg-[#febc2e]" />
            <i className="block h-3 w-3 rounded-full bg-[#28c840]" />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-bold text-muted">
            <b className="text-ink">pulse-find</b> — {TOUR_WINDOW_TITLE.split(" — ")[1]}
          </span>
          <span className="pf-tour-drag-hint shrink-0 text-[11.5px] font-bold text-faint">✥ drag me</span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] text-accent">
            <i className="pf-tour-live-dot block h-[7px] w-[7px] rounded-full bg-accent" aria-hidden="true" />
            LIVE TOUR
          </span>
          <button
            type="button"
            onClick={closeTour}
            aria-label="Close tour"
            className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <div
              className="relative h-[62px] w-[62px] shrink-0 cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Tap Pulse for a sparkle burst"
              title="Tap me!"
              onClick={burst}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  burst();
                }
              }}
            >
              <div className="pf-tour-crystal-glow absolute inset-0 rounded-full" aria-hidden="true" />
              <div className={`absolute inset-x-[13px] inset-y-[9px] ${spinning ? "pf-tour-spin" : "pf-tour-bob"}`} aria-hidden="true">
                <PulseCrystal className="h-full w-full" />
              </div>
              {sparks.map((s) => (
                <span
                  key={s.id}
                  className="pf-tour-spark"
                  style={{ left: `${s.left}px`, top: `${s.top}px`, "--sx": `${s.sx}px`, "--sy": `${s.sy}px` } as CSSProperties}
                  aria-hidden="true"
                >
                  {s.glyph}
                </span>
              ))}
            </div>
            <div key={`${step}:${bubble.title}`} className="pf-tour-bubble min-w-0 flex-1" aria-live="polite">
              <div className="font-display text-[12px] font-extrabold uppercase tracking-[0.06em] text-accent">
                Pulse · your guide
              </div>
              <h2 id="pf-tour-bubble-title" className="mt-0.5 font-display text-[16.5px] font-bold leading-snug">
                {bubble.title}
              </h2>
              <p className="mt-1 text-sm text-muted">{bubble.text}</p>
            </div>
          </div>

          <div className="pf-tour-hint mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft px-3 py-1.5 text-[12.5px] font-extrabold text-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.7 1 1.5 1 2.5h6c0-1 .2-1.8 1-2.5A6 6 0 0 0 12 3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {stepDef.hint}
          </div>

          <div className="mt-4 flex items-center gap-2.5">
            <div className="flex flex-1 gap-1.5" aria-hidden="true">
              {TOUR_STEPS.map((s, i) => (
                <i
                  key={s.tag}
                  className={`h-2.5 flex-1 rounded border border-line transition-all ${
                    i < step
                      ? "border-accent/60 bg-accent shadow-[0_0_10px_rgba(253,88,93,0.35)]"
                      : "bg-surface-2"
                  } ${i === step - 1 ? "pf-tour-xp-now" : ""}`}
                />
              ))}
            </div>
            <span className="shrink-0 text-[12.5px] font-extrabold tabular-nums text-faint">
              Step {step} of {TOUR_TOTAL_STEPS}
            </span>
          </div>
          <svg className="pf-tour-ecg mt-0.5 block h-5 w-full" viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden="true">
            <path d={ECG_PATH} />
          </svg>

          <section key={step} className="pf-tour-stage mt-2 rounded-2xl border border-line bg-surface p-3.5" aria-label="Feature preview">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.11em] text-accent">
                {stepDef.tag}
              </span>
              <span className="font-display text-[15.5px] font-bold">{stepDef.title}</span>
            </div>
            {renderStage()}
          </section>

          {!isFinale && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <div className="flex gap-1.5 max-sm:order-first max-sm:w-full max-sm:justify-center" role="tablist" aria-label="Tour steps">
                  {TOUR_STEPS.map((s, i) => {
                    const locked = i + 1 > TOUR_JOBS_STEP && !deckCleared;
                    return (
                      <button
                        key={s.tag}
                        type="button"
                        aria-label={`Go to step ${i + 1}: ${s.tag}`}
                        onClick={() => goTo(i + 1)}
                        disabled={locked}
                        className={`h-[30px] w-[30px] rounded-full border text-[11.5px] font-extrabold transition-all ${
                          locked
                            ? "cursor-not-allowed border-line bg-surface-2 text-faint opacity-40"
                            : i + 1 === step
                              ? "scale-[1.12] border-accent bg-accent text-accent-ink shadow-[0_0_13px_rgba(253,88,93,0.5)]"
                              : i + 1 < step
                                ? "border-accent/50 bg-surface-2 text-[#ffb3bb]"
                                : "border-line bg-surface-2 text-faint"
                        }`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  disabled={step === 1}
                  className="ml-auto rounded-xl border border-line bg-transparent px-4 py-2.5 text-[14.5px] font-bold text-muted transition hover:text-ink disabled:cursor-default disabled:opacity-35 max-sm:ml-0"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => goTo(step + 1)}
                  disabled={!nextEnabled}
                  className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[15.5px] font-extrabold text-accent-ink shadow-[0_6px_22px_rgba(253,88,93,0.4)] transition enabled:hover:-translate-y-px enabled:hover:scale-[1.02] enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none max-sm:flex-1 ${
                    nextEnabled ? "pf-tour-next-glow" : ""
                  }`}
                >
                  {step === TOUR_JOBS_STEP && !deckCleared
                    ? "Swipe to continue"
                    : step === TOUR_TOTAL_STEPS
                      ? "Tour complete"
                      : "Next"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {installMode !== "hidden" && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={onGetApp}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2 text-[13px] font-bold text-muted transition hover:text-ink"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Get the app
                  </button>
                </div>
              )}
              {installGuideOpen && (
                <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5" role="status">
                  <p className="font-display text-[14px] font-bold">Add to Home Screen</p>
                  <ol className="mt-2 space-y-1 text-[13.5px] text-muted">
                    <li>1. Tap the Share button in Safari.</li>
                    <li>2. Tap Add to Home Screen.</li>
                    <li>3. Tap Add. Pulse Find opens straight to your tracker.</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setInstallGuideOpen(false)}
                    className="mt-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:text-ink"
                  >
                    Got it
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={openTour}
                className="mx-auto mt-2.5 block min-h-[32px] text-[13px] font-bold text-faint underline underline-offset-[3px] transition hover:text-muted"
              >
                Restart the tour
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The demo nav's "Take the tour" button: opens the window at step 1
    from any demo page. A button, not a link: the tour is an overlay,
    not a route, and the old tour param is gone. */
export function TakeTourButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={`cursor-pointer ${className ?? ""}`}
      aria-label="Take the guided tour of the demo"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT))}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <PulseDot />
        Take the tour
      </span>
    </button>
  );
}

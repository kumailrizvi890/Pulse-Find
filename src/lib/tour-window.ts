// Guided tour window (Nov 19 2026 redesign): Pulse tours the visitor
// around in one small draggable window, 8 stops, tap Next to advance.
// Only the jobs stop asks for a real action: the real swipe deck, and
// its saves always go through the demo/local job picks, never through
// Supabase, so the tour never touches real user data. Everything here
// is pure and testable: the step copy, the auto-start rule, the
// completion flag, the fallback deck and the badge text. No em dashes
// in any user-facing string.

import type { DeckJob } from "@/app/jobs/SwipeDeck";

export const TOUR_TOTAL_STEPS = 8;
/** 1-based index of the jobs stop, the only stop with a gate. */
export const TOUR_JOBS_STEP = 4;
/** Cards in the tour deck. Next stays locked until all are decided. */
export const TOUR_DECK_SIZE = 3;
/** Set when the visitor reaches the finale, clicks Connect, or
    dismisses the tour with X/Escape. A dismiss counts as done: a
    visitor who closes the tour chose to skip it and is not forced
    through it again on a later visit. */
export const TOUR_DONE_KEY = "pulsefind-tour-v2";
/** Dispatched by TakeTourButton; the window opens at step 1. */
export const OPEN_TOUR_EVENT = "pulsefind:open-tour";
/** Dispatched by the window on open/close, so the floating assistant
    can hide while the tour is up. */
export const TOUR_OPEN_EVENT = "pulsefind:tour-open";
export const TOUR_CLOSE_EVENT = "pulsefind:tour-close";
/** The finale's only button. The preview linked /demo/connect; the
    live build goes straight to sign-up. */
export const TOUR_CONNECT_HREF = "/signup";
export const TOUR_WINDOW_TITLE = "pulse-find — guided_tour.window";
export const TOUR_CONFETTI_COLORS = ["#ff2e42", "#f5a623", "#2fbf71", "#588cff", "#ff8a96"];
export const TOUR_SPARK_GLYPHS = ["✦", "✧", "♥"];
/** Confetti pieces on the finale. */
export const TOUR_CONFETTI_COUNT = 42;
/** Sparks in one crystal tap burst. */
export const TOUR_SPARK_COUNT = 7;

export interface TourWindowStep {
  /** Short name for the stage tag and the progress dots. */
  tag: string;
  /** Stage panel heading. */
  title: string;
  /** Pulse's speech-bubble heading. */
  bubbleTitle: string;
  /** Pulse's speech-bubble line. */
  bubbleText: string;
  /** Hint pill under the bubble. */
  hint: string;
}

export const TOUR_STEPS: TourWindowStep[] = [
  {
    tag: "Welcome",
    title: "Say hi to Pulse Find",
    bubbleTitle: "Hey! I'm Pulse.",
    bubbleText: "Quick tour. No homework. Just tap Next — I got you.",
    hint: "Tap Next, let's go!",
  },
  {
    tag: "Dashboard",
    title: "One home for the whole search",
    bubbleTitle: "This is home base.",
    bubbleText: "Everything in one spot. Stuff that needs you? Right at the top.",
    hint: "Refreshed every morning",
  },
  {
    tag: "Leads",
    title: "Fresh roles, matched to you",
    bubbleTitle: "Fresh jobs, daily.",
    bubbleText: "Roles that actually fit you, newest first. Get in early!",
    hint: "No random jobs, promise",
  },
  {
    tag: "Find jobs",
    title: "The swipe deck",
    bubbleTitle: "Okay, your turn!",
    bubbleText: "Swipe right to save, left to pass. Saved jobs land in your Leads. Go!",
    hint: "Clear all 3 to continue",
  },
  {
    tag: "Tracker",
    title: "Every application, tracked",
    bubbleTitle: "No spreadsheet chaos.",
    bubbleText: "Applied, OA, interview — all color-coded. Exports to Excel too.",
    hint: "Red, amber, green. Easy.",
  },
  {
    tag: "Networking",
    title: "People behind the postings",
    bubbleTitle: "People > postings.",
    bubbleText: "I line up recruiters and alumni for you. Real humans, real replies.",
    hint: "A connect counts as a reply",
  },
  {
    tag: "Your agent",
    title: "Pulse Find + your AI agent",
    bubbleTitle: "Bring your AI.",
    bubbleText: "Your agent can run this whole thing via MCP. One tap to hand off.",
    hint: "Claude Code, Cursor, Copilot + more",
  },
  {
    tag: "All done",
    title: "Tour complete",
    bubbleTitle: "That's it — you did it!",
    bubbleText: "Dashboard, leads, swipes, tracker, people, agent. Hit Connect and you're in!",
    hint: "All 3 badges unlocked!",
  },
];

/** The tour auto-starts only on the front door, for a signed-out
    visitor who has never finished or dismissed it. Signed-in visitors
    never see the gate: they go straight to their dashboard, and there
    is no / → /app redirect. Deep links (/demo, /jobs, /login, …) never
    force-gate either. */
export function shouldAutoStartTour({
  signedIn,
  completed,
  pathname,
}: {
  signedIn: boolean;
  completed: boolean;
  pathname: string | null;
}): boolean {
  return !signedIn && !completed && pathname === "/";
}

/** True once the visitor finished or dismissed the tour. Never throws:
    a browser that blocks storage reads as not done. */
export function isTourDone(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(TOUR_DONE_KEY) === "done";
  } catch {
    return false;
  }
}

/** Remember the tour as done (finale, Connect, or dismiss). Never
    throws: a browser that blocks storage still closes the tour. */
export function markTourDone(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(TOUR_DONE_KEY, "done");
  } catch {
    // A browser that blocks local storage still closes the tour.
  }
}

/** The Master Swiper badge line: what the visitor actually did with
    the deck. */
export function badgeSwipeText(savedCount: number): string {
  return savedCount > 0
    ? `Saved ${savedCount} job${savedCount === 1 ? "" : "s"} to Leads`
    : "Passed the whole deck";
}

/** The deck-cleared line under "Deck cleared. Nice swiping!". */
export function deckDoneText(savedCount: number): string {
  return savedCount > 0
    ? `You saved ${savedCount} job${savedCount === 1 ? "" : "s"}. They are in your Leads, ready to go!`
    : "Passed them all? Bold. Fresh ones drop tomorrow.";
}

/** What Pulse says once the deck clears: the only homework is done. */
export const TOUR_DECK_CLEARED_BUBBLE = {
  title: "Nailed it!",
  text: "That was the only homework. Hit Next!",
} as const;

/** What Pulse says right after one card is decided, while cards
    remain. Mirrors the preview: a save lands in Leads, a pass is
    no big deal. */
export function deckDecideBubble(choice: "saved" | "hidden", remaining: number): { title: string; text: string } {
  return choice === "saved"
    ? { title: "Saved!", text: "Straight to your Leads. No forms, no fuss." }
    : {
        title: "Passed!",
        text: `No worries. Fresh cards drop daily. ${remaining} to go!`,
      };
}

/** Columns for the tour's jobs fetch: the same shape as the jobs
    board's query (active, Internship track, tech, newest first). */
export const TOUR_JOBS_COLS = "id,company,title,location,remote,url,track,tech,posted_at";

function hoursAgoISO(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

/** The deck when Supabase is unconfigured, the fetch fails, or it
    returns no jobs: the preview's three fictional roles. Same shape as
    a board row, so the real deck renders them unchanged. No posting
    URLs: these are fictional, so Details has nothing to open. */
export const TOUR_FALLBACK_JOBS: DeckJob[] = [
  {
    id: "tour-fallback-stripe",
    company: "Stripe",
    title: "Software Engineer Intern",
    location: "Seattle, WA · Hybrid",
    remote: false,
    url: "",
    track: "Internship",
    tech: true,
    posted_at: hoursAgoISO(2),
  },
  {
    id: "tour-fallback-databricks",
    company: "Databricks",
    title: "AI Engineering Intern",
    location: "Remote · US",
    remote: true,
    url: "",
    track: "Internship",
    tech: true,
    posted_at: hoursAgoISO(5),
  },
  {
    id: "tour-fallback-figma",
    company: "Figma",
    title: "Frontend Engineering Intern",
    location: "San Francisco, CA · Onsite",
    remote: false,
    url: "",
    track: "Internship",
    tech: true,
    posted_at: hoursAgoISO(9),
  },
];

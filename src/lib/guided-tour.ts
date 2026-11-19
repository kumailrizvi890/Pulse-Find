// Guided tour, quest edition: a character-led walkthrough of the demo
// tracker where Pulse talks and the visitor acts.
//
// One step per feature, in the order a new user should meet them:
// dashboard, sheet, leads, swipe board, networking, the Ask Pulse
// chatbot, Connect Agent. The tour is driven by the `tour` search
// param (?tour=<step-id>), so each step is a plain link and the browser
// back button walks the tour backwards. All functions here are pure so
// tests can pin the order, the routes and the copy. No em dashes in any
// user-facing string.
//
// The coach has no buttons: each step carries one line from Pulse (what
// the feature is for, the one action to try, where it lives), a done
// line for the moment the action lands, and a `completion` kind that
// says which real action in the real UI advances the tour. The tour
// never performs the action itself; it only watches for it. The first
// step orients the visitor on the nav tabs and the tour order, and the
// last step takes them to sign in, celebrates the tour, and leaves the
// 2 easy steps to a free account and a token: create the account, then
// grab the token from Connect once they are in.
//
// Safety: every completion action is non-destructive. On the demo the
// same actions may write sample data only (swipe a demo card, edit a
// demo cell); on signed-in pages the tour only ever asks for focus,
// open, preview or copy. The jobs step is the one place the mode
// matters: a signed-out visitor swipes a demo card, a signed-in
// visitor only opens a posting to peek at it, never saves a real job.
// The last step only ever asks for the sign-up toggle on the sign-in
// page; the tour never submits the form or creates an account.

export type TourStepId =
  | "dashboard"
  | "sheet"
  | "jobs"
  | "leads"
  | "networking"
  | "chat"
  | "connect";

/**
 * The one real action that completes a step. The host watches for
 * exactly this in the live UI and advances only when it happens.
 */
export type TourCompletion =
  | "waiting-open"
  | "sheet-filter"
  | "jobs-swipe"
  | "lead-edit"
  | "contact-edit"
  | "chat-ask"
  | "connect-signup";

/** Fired on window by the swipe deck when a real drag on the top card
    passes the swipe threshold, left or right. Buttons, arrow keys and
    the save toast never fire it: the guided tour completes the jobs
    step on a swipe only. The detail carries the direction, "saved" for
    a right swipe and "hidden" for a left one. */
export const JOB_SWIPED_EVENT = "pulsefind:job-swiped";

export type JobSwipedDetail = { direction: "saved" | "hidden" };

export interface TourStep {
  id: TourStepId;
  /** Short name, used only for the progress dots' labels. */
  title: string;
  /** What Pulse says on this step: where the feature lives, how to use
      it, and the one thing to try. One short line, plain lowercase
      friend voice. */
  line: string;
  /** What Pulse says once the action lands: the real result, not a
      trophy. */
  done: string;
  /** Signed-in variant of the line (jobs step only: preview, never
      save a real job). */
  lineAlt?: string;
  /** Signed-in variant of the done line (jobs step only). */
  doneAlt?: string;
  /** Which real action completes this step. */
  completion: TourCompletion;
  /** The demo route this step lives on. */
  route: string;
  /** The data-tour anchor the spotlight ring targets on that route. */
  anchor: string;
  /** Signed-in variant of the anchor (jobs step only: the posting link
      instead of the save button). */
  anchorAlt?: string;
}

export const TOUR_PARAM = "tour";

/** Session flag set when the visitor skips, exits or finishes the tour,
    so a plain /demo visit does not auto-start it again in the same
    session. Any arrival with a ?tour= param clears it (force-start). */
export const TOUR_DISMISSED_KEY = "pulsefind-tour-dismissed";

/** Delay after a completed action before the tour moves on, so the
    visitor sees the real result (the row landing, the reply arriving)
    and Pulse's done line. */
export const TOUR_ADVANCE_MS = 1400;
/** Same delay when the visitor prefers reduced motion: short, no burst. */
export const TOUR_ADVANCE_MS_REDUCED = 700;

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    line: "this is home. tap Open on the first waiting task at the top of the waiting on you panel",
    done: "nice, that's the list that matters most",
    completion: "waiting-open",
    route: "/demo",
    anchor: "waiting-first",
  },
  {
    id: "sheet",
    title: "Sheet",
    line: "tap the Status dropdown in the toolbar above the sheet, then pick any stage and watch the rows narrow",
    done: "see how fast that narrows it down",
    completion: "sheet-filter",
    route: "/demo/sheet",
    anchor: "sheet-tools",
  },
  {
    id: "leads",
    title: "Leads",
    line: "tap Edit on the first lead row to see everything you know about that role",
    done: "that's the whole lead, fit note and all",
    completion: "lead-edit",
    route: "/demo/leads",
    anchor: "lead-edit",
  },
  {
    id: "jobs",
    title: "Jobs board",
    line: "swipe the top card right to save the job or left to pass it, a save lands in your leads",
    done: "there it goes, that is how the board works",
    lineAlt: "tap View posting on the top card to peek at the role",
    doneAlt: "that's the one, the posting opens right from the card",
    completion: "jobs-swipe",
    route: "/jobs",
    anchor: "job-card",
    anchorAlt: "job-posting",
  },
  {
    id: "networking",
    title: "Networking",
    line: "tap Edit on the first contact row to see what you owe them and when",
    done: "that's their whole story, next step and all",
    completion: "contact-edit",
    route: "/demo/networking",
    anchor: "contact-edit",
  },
  {
    id: "chat",
    title: "Ask Pulse",
    line: "tap Ask Pulse in the top bar and ask what is due next, i never guess",
    done: "see, that's straight from your tracker",
    completion: "chat-ask",
    route: "/demo",
    anchor: "ask-pulse",
  },
  {
    id: "connect",
    title: "Connect",
    line: "last stop. 2 easy steps to your token: 1 create a free account here, 2 grab it from connect once you are in",
    done: "you did it. finish the account and grab your token from connect, then start with one application and one saved job. replay anytime from take the tour in the demo nav",
    completion: "connect-signup",
    route: "/login",
    anchor: "connect-signup",
  },
];

/** Rewards, guidance-first: a small chip earned only by doing the real
    action on its step, never by tapping through. There is no Next
    button to game, and no full-screen achievement wall: earned chips
    sit quietly in the coach, the ring around the crystal fills as
    steps complete, and the last step shows a short recap of what the
    visitor just did. The names come from the Nov 17 02:56 design
    (Explorer, Inbox Zero, Networker); the mapping is: Explorer for
    swiping the jobs board, Inbox Zero for opening the first waiting
    task, Networker for opening a due contact. */
export type TourBadgeId = "explorer" | "inbox-zero" | "networker";

export interface TourBadge {
  id: TourBadgeId;
  name: string;
  /** The step whose real action earns it. */
  earnedBy: TourStepId;
  /** One short line for the recap. */
  blurb: string;
}

export const TOUR_BADGES: TourBadge[] = [
  { id: "inbox-zero", name: "Inbox Zero", earnedBy: "dashboard", blurb: "opened a waiting task" },
  { id: "explorer", name: "Explorer", earnedBy: "jobs", blurb: "swiped a job card" },
  { id: "networker", name: "Networker", earnedBy: "networking", blurb: "opened a due contact" },
];

/** The badge a step earns, if any. */
export function badgeForStep(stepId: TourStepId): TourBadge | undefined {
  return TOUR_BADGES.find((b) => b.earnedBy === stepId);
}

/** What the tour remembers across visits, so a replay shows what was
    earned. Stored as JSON in localStorage under TOUR_PROGRESS_KEY,
    next to the session dismissed flag. Only step completions and
    badges earned by real actions are ever written here. */
export const TOUR_PROGRESS_KEY = "pulsefind-tour-progress";

export interface TourProgress {
  steps: TourStepId[];
  badges: TourBadgeId[];
}

export function emptyTourProgress(): TourProgress {
  return { steps: [], badges: [] };
}

/** The progress after a step's real action lands: the step is added
    once, and its badge too when it earns one. Pure, so tests can pin
    the one-badge-per-step rule without a browser. */
export function progressAfterCompletion(progress: TourProgress, stepId: TourStepId): TourProgress {
  const steps = progress.steps.includes(stepId) ? progress.steps : [...progress.steps, stepId];
  const badge = badgeForStep(stepId);
  const badges =
    badge && !progress.badges.includes(badge.id) ? [...progress.badges, badge.id] : progress.badges;
  return { steps, badges };
}

/** Fraction of the tour done (0 to 1), for the ring around the crystal. */
export function tourProgressFraction(progress: TourProgress): number {
  return progress.steps.length / TOUR_STEPS.length;
}

/** The progress ring is an SVG circle of this radius around the
    crystal. The dash values are strings with two decimals, so the
    host can set them straight onto the circle. */
export const TOUR_RING_RADIUS = 26;

export function tourRingDash(fraction: number): { dasharray: string; dashoffset: string } {
  const circumference = 2 * Math.PI * TOUR_RING_RADIUS;
  const clamped = Math.max(0, Math.min(1, fraction));
  return {
    dasharray: circumference.toFixed(2),
    dashoffset: (circumference * (1 - clamped)).toFixed(2),
  };
}

/** One short line per completed step, in tour order, for the recap on
    the last step. The jobs line follows the mode: a signed-in visitor
    peeks at a posting instead of swiping a real job. */
export function tourRecapLines(completed: TourStepId[], signedIn: boolean): string[] {
  const lines: Record<TourStepId, string> = {
    dashboard: "opened a waiting task",
    sheet: "filtered the sheet by stage",
    jobs: signedIn ? "peeked at a posting" : "swiped a job card",
    leads: "opened a lead",
    networking: "opened a due contact",
    chat: "asked Pulse what is due next",
    connect: "went to sign in for your token",
  };
  return TOUR_STEPS.filter((s) => completed.includes(s.id)).map((s) => lines[s.id]);
}

/** True for the demo routes, where sample data may be written by a
    tour action (save a demo job, edit a demo cell). Everywhere else the
    tour only ever asks for focus, open, preview or copy. */
export function isDemoPath(pathname: string): boolean {
  return pathname === "/demo" || pathname.startsWith("/demo/");
}

/** The step for a `tour` param value, or null when the tour is not running. */
export function parseTourStep(value: string | null): TourStep | null {
  if (!value) return null;
  return TOUR_STEPS.find((s) => s.id === value) ?? null;
}

export function tourStepIndex(step: TourStep): number {
  return TOUR_STEPS.indexOf(step);
}

export function nextTourStep(step: TourStep): TourStep | null {
  return TOUR_STEPS[tourStepIndex(step) + 1] ?? null;
}

export function prevTourStep(step: TourStep): TourStep | null {
  return TOUR_STEPS[tourStepIndex(step) - 1] ?? null;
}

/** The URL that opens this step (route + tour param). */
export function tourHref(step: TourStep): string {
  return `${step.route}?${TOUR_PARAM}=${step.id}`;
}

/** The URL that opens the tour from the start. */
export function tourStartHref(): string {
  return tourHref(TOUR_STEPS[0]);
}

export interface CardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CardPlacement {
  left: number;
  top: number;
}

/** Gap between the spotlighted anchor and the tour card, in pixels. */
export const TOUR_CARD_GAP = 16;

/** Desktop card width in pixels. Phones keep the bottom sheet instead. */
export const TOUR_CARD_WIDTH = 380;

/**
 * Where the tour card should sit for an anchor, so it never covers the
 * feature it is describing. Tries right of the anchor, then left, then
 * below, then above, each with a 16px gap. Returns null when nothing fits
 * (a huge or full-viewport anchor, like the dashboard), and the caller
 * falls back to the bottom dock. Pure, so tests can pin the order and
 * the no-overlap rule without a browser.
 */
export function placeTourCard(
  anchor: CardRect,
  viewport: Viewport,
  cardHeight: number,
): CardPlacement | null {
  const w = TOUR_CARD_WIDTH;
  const gap = TOUR_CARD_GAP;
  const clampTop = (top: number) => Math.max(8, Math.min(top, viewport.height - cardHeight - 8));
  const clampLeft = (left: number) => Math.max(8, Math.min(left, viewport.width - w - 8));
  // Right of the anchor.
  const right = anchor.x + anchor.width + gap;
  if (right + w <= viewport.width - 8 && cardHeight + 16 <= viewport.height) {
    return { left: right, top: clampTop(anchor.y) };
  }
  // Left of the anchor.
  const left = anchor.x - gap - w;
  if (left >= 8 && cardHeight + 16 <= viewport.height) {
    return { left, top: clampTop(anchor.y) };
  }
  // Below the anchor.
  const below = anchor.y + anchor.height + gap;
  if (below + cardHeight <= viewport.height - 8) {
    return { left: clampLeft(anchor.x), top: below };
  }
  // Above the anchor.
  const above = anchor.y - gap - cardHeight;
  if (above >= 8) {
    return { left: clampLeft(anchor.x), top: above };
  }
  return null;
}

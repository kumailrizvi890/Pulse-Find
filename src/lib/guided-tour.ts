// Guided tour, quest edition: a character-led walkthrough of the demo
// tracker where Pulse talks and the visitor acts.
//
// One step per feature, in the order a new user should meet them:
// dashboard, sheet, find jobs, swipe board, leads, networking, the Ask
// Pulse chatbot, Connect Agent. The tour is driven by the `tour` search
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
// last step closes with where to start and the replay link.
//
// Safety: every completion action is non-destructive. On the demo the
// same actions may write sample data only (save a demo job, edit a demo
// cell); on signed-in pages the tour only ever asks for focus, open,
// preview or copy. The jobs step is the one place the mode matters:
// a signed-out visitor saves a demo card, a signed-in visitor only
// opens a posting to peek at it, never saves a real job.

export type TourStepId =
  | "dashboard"
  | "sheet"
  | "find-jobs"
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
  | "jobs-search"
  | "jobs-save"
  | "lead-edit"
  | "contact-edit"
  | "chat-ask"
  | "connect-copy";

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
    line: "this is home and the tour follows the tabs up top. tap open on a waiting task and see what it needs",
    done: "nice, that's the list that matters most",
    completion: "waiting-open",
    route: "/demo",
    anchor: "waiting-first",
  },
  {
    id: "sheet",
    title: "Sheet",
    line: "this is your tracker as a sheet. pick a stage in the status dropdown and watch the rows narrow",
    done: "see how fast that narrows it down",
    completion: "sheet-filter",
    route: "/demo/sheet",
    anchor: "sheet-tools",
  },
  {
    id: "find-jobs",
    title: "Find jobs",
    line: "fresh roles land here every few hours. type a company or a role in the search and see what shows up",
    done: "there they are, all fresh from the career pages",
    completion: "jobs-search",
    route: "/jobs",
    anchor: "find-jobs",
  },
  {
    id: "jobs",
    title: "Jobs board",
    line: "this is the board. tap save on a card you like and it lands in your leads",
    done: "saved, it's waiting in your leads whenever you want it",
    lineAlt: "this is the board. tap a posting to peek at the role",
    doneAlt: "that's the one, the posting opens right from the card",
    completion: "jobs-save",
    route: "/jobs",
    anchor: "job-save",
    anchorAlt: "job-posting",
  },
  {
    id: "leads",
    title: "Leads",
    line: "these are roles you found but haven't applied to yet. tap edit on one to see everything you know about it",
    done: "that's the whole lead, fit note and all",
    completion: "lead-edit",
    route: "/demo/leads",
    anchor: "lead-edit",
  },
  {
    id: "networking",
    title: "Networking",
    line: "everyone you know at a company lives here. tap edit on someone due to see what you owe them",
    done: "that's their whole story, next step and all",
    completion: "contact-edit",
    route: "/demo/networking",
    anchor: "contact-edit",
  },
  {
    id: "chat",
    title: "Ask Pulse",
    line: "i can answer from your tracker and i never guess. tap ask pulse up top and ask me what's due next",
    done: "see, that's straight from your tracker",
    completion: "chat-ask",
    route: "/demo",
    anchor: "ask-pulse",
  },
  {
    id: "connect",
    title: "Connect",
    line: "this is how claude, cursor or copilot plug in. tap copy on the setup steps and the prompt is ready to paste",
    done: "and that's the whole tour. start with one application and one saved job then ask me what's due next. replay anytime from take the tour in the demo nav",
    completion: "connect-copy",
    route: "/demo/connect",
    anchor: "connect-copy",
  },
];

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

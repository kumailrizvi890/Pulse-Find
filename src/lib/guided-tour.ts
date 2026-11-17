// Guided tour: the Pulse-narrated walkthrough of the demo tracker.
//
// One step per feature, in the order a new user should meet them:
// dashboard, sheet, find jobs, swipe board, leads, networking, the Ask
// Pulse chatbot, Connect Agent. The tour is driven by the `tour` search
// param (?tour=<step-id>), so each step is a plain link and the browser
// back button walks the tour backwards. All functions here are pure so
// tests can pin the order, the routes and the copy. No em dashes in any
// user-facing string.
//
// Each step teaches, not just describes: the body says what the feature
// is for, the one action to try, and where it lives in navigation. The
// first step orients the visitor on the nav tabs and the tour order, and
// the last step closes with where to start and the replay link. Every
// step also carries a Try-it label for the hands-on button in the card.

export type TourStepId =
  | "dashboard"
  | "sheet"
  | "find-jobs"
  | "jobs"
  | "leads"
  | "networking"
  | "chat"
  | "connect";

export interface TourStep {
  id: TourStepId;
  /** Short heading shown in the tour card. */
  title: string;
  /** What Pulse says on this step: what the feature is for, the one action
      to try, and where it lives in navigation. */
  body: string;
  /** Label for the Try-it button, which focuses the feature without
      advancing the step. */
  tryIt: string;
  /** The demo route this step lives on. */
  route: string;
  /** The data-tour anchor the spotlight ring targets on that route. */
  anchor: string;
}

export const TOUR_PARAM = "tour";

/** Session flag set when the visitor skips, exits or finishes the tour,
    so a plain /demo visit does not auto-start it again in the same
    session. Any arrival with a ?tour= param clears it (force-start). */
export const TOUR_DISMISSED_KEY = "pulsefind-tour-dismissed";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    title: "Your dashboard, at a glance",
    body: "This is home, and the tour follows the tabs up top in order: Dashboard, Sheet, Leads, Networking, then Connect, with Jobs in the top nav. Waiting on you is the list that matters: assessments to finish, interviews to schedule, forms half done, soonest deadline first. The pace chart tracks your week against your goal and the funnel shows where every application sits. Add application, Import sheet, Export and Settings sit at the top of this page.",
    tryIt: "Try it: focus a waiting task",
    route: "/demo",
    anchor: "dashboard",
  },
  {
    id: "sheet",
    title: "Your tracker as a sheet",
    body: "Find it under Sheet in the demo nav. The same tracker, spreadsheet view. Click any editable cell to change it and it saves right away. Use the status dropdown to filter by stage, the search box to find any row, and the Waiting on you toggle to see only what needs you. Export to Excel or CSV from the buttons up top.",
    tryIt: "Try it: focus the sheet tools",
    route: "/demo/sheet",
    anchor: "sheet",
  },
  {
    id: "find-jobs",
    title: "Fresh jobs, straight from career pages",
    body: "Find it under Jobs in the top nav. New roles pulled from 50+ company career pages every 6 hours, no reposts. Filter by Internship or New Grad, Tech only, Remote, or search a company. When one fits, save it, and when you apply, mark it Applied and it lands straight in your tracker.",
    tryIt: "Try it: focus the job search",
    route: "/jobs",
    anchor: "find-jobs",
  },
  {
    id: "jobs",
    title: "Swipe the openings",
    body: "Same Jobs page, the board below the search. Work the queue one card at a time. Swipe right to save a role, left to hide it. Saved roles gather on the right, ready to apply. Open the posting from there, or mark one Applied and it goes straight into your tracker.",
    tryIt: "Try it: focus the card actions",
    route: "/jobs",
    anchor: "jobs",
  },
  {
    id: "leads",
    title: "Leads worth chasing",
    body: "Find it under Leads in the demo nav. Roles you found but have not applied to yet, with a fit note on each. Search by company, role or place, or filter by status. When you apply to one, it moves into your tracker and off this list. Mark the ones that do not fit so they stop taking up space.",
    tryIt: "Try it: focus the lead filters",
    route: "/demo/leads",
    anchor: "leads",
  },
  {
    id: "networking",
    title: "Never drop a follow-up",
    body: "Find it under Networking in the demo nav. Everyone you know at a company, with what to do next and when. Overdue and due-today follow-ups sit at the top. Search matches names, companies, next steps and notes. Long notes tuck behind Show more, tap it to read the full note.",
    tryIt: "Try it: focus the people search",
    route: "/demo/networking",
    anchor: "networking",
  },
  {
    id: "chat",
    title: "Ask Pulse anything",
    body: "Find it under Ask Pulse in the top nav, or the Ask Pulse button on the dashboard. Pulse answers from your tracker and never guesses. Ask what is waiting, who went quiet, or what is due next. Open a task first and Ask Pulse answers about that task. Anything bigger goes to Talk to Agent, which hands the whole thing to your connected agent.",
    tryIt: "Try it: focus Ask Pulse",
    route: "/demo",
    anchor: "ask-pulse",
  },
  {
    id: "connect",
    title: "Connect your agent",
    body: "Find it under Connect in the demo nav. Give Claude, Cursor or Copilot an access token and your agent reads your email, logs applications and updates the tracker for you. Pulse Find never sees your inbox. This is the same MCP server the demo runs on. Where to start: add one application, save one job from Jobs, then ask Pulse what is due next. Replay this tour anytime from Take the tour in the demo nav.",
    tryIt: "Try it: focus the setup steps",
    route: "/demo/connect",
    anchor: "connect",
  },
];

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

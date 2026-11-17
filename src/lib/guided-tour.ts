// Guided tour: the Pulse-narrated walkthrough of the demo tracker.
//
// One step per feature, in the order a new user should meet them:
// dashboard, sheet, find jobs, swipe board, leads, networking, the Ask
// Pulse chatbot, Connect Agent. The tour is driven by the `tour` search
// param (?tour=<step-id>), so each step is a plain link and the browser
// back button walks the tour backwards. All functions here are pure so
// tests can pin the order, the routes and the copy. No em dashes in any
// user-facing string.

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
  /** What Pulse says on this step: what the feature does and how to use it right. */
  body: string;
  /** The demo route this step lives on. */
  route: string;
  /** The data-tour anchor the spotlight ring targets on that route. */
  anchor: string;
}

export const TOUR_PARAM = "tour";

export const TOUR_STEPS: TourStep[] = [
  {
    id: "dashboard",
    title: "Your dashboard, at a glance",
    body: "This is home. Waiting on you is the list that matters: assessments to finish, interviews to schedule, forms half done, soonest deadline first. The pace chart tracks your week against your goal, and the funnel shows where every application sits.",
    route: "/demo",
    anchor: "dashboard",
  },
  {
    id: "sheet",
    title: "Your tracker as a sheet",
    body: "The same tracker, spreadsheet view. Click any editable cell to change it and it saves right away. Search and filter across everything, and export to Excel or CSV whenever you want a copy.",
    route: "/demo/sheet",
    anchor: "sheet",
  },
  {
    id: "find-jobs",
    title: "Fresh jobs, straight from career pages",
    body: "New roles pulled from 50+ company career pages every 6 hours, no reposts. Filter by Internship or New Grad, Tech only, Remote, or search a company. When one fits, save it, and when you apply, mark it Applied and it lands straight in your tracker.",
    route: "/jobs",
    anchor: "find-jobs",
  },
  {
    id: "jobs",
    title: "Swipe the openings",
    body: "Work the queue one card at a time. Swipe right to save a role, left to hide it. Saved roles gather on the right, ready to apply. Open the posting from there, or mark one Applied and it goes straight into your tracker.",
    route: "/jobs",
    anchor: "jobs",
  },
  {
    id: "leads",
    title: "Leads worth chasing",
    body: "Roles you found but have not applied to yet, with a fit note on each. When you apply to one, it moves into your tracker and off this list. Mark the ones that do not fit so they stop taking up space.",
    route: "/demo/leads",
    anchor: "leads",
  },
  {
    id: "networking",
    title: "Never drop a follow-up",
    body: "Everyone you know at a company, with what to do next and when. Overdue and due-today follow-ups sit at the top. Search matches names, companies, next steps and notes, so nothing slips through.",
    route: "/demo/networking",
    anchor: "networking",
  },
  {
    id: "chat",
    title: "Ask Pulse anything",
    body: "Pulse answers from your tracker and never guesses. Ask what is waiting, who went quiet, or what is due next. Anything bigger goes to Talk to Agent, which hands the whole thing to your connected agent.",
    route: "/demo",
    anchor: "ask-pulse",
  },
  {
    id: "connect",
    title: "Connect your agent",
    body: "Give Claude, Cursor or Copilot an access token and your agent reads your email, logs applications and updates the tracker for you. Pulse Find never sees your inbox. This is the same MCP server the demo runs on.",
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TOUR_DISMISSED_KEY,
  TOUR_STEPS,
  nextTourStep,
  parseTourStep,
  placeTourCard,
  prevTourStep,
  tourHref,
  tourStartHref,
  type TourStepId,
} from "@/lib/guided-tour";
import { answerGeneralQuestion, DEFAULT_APP_ORIGIN, type GeneralChatContext } from "@/lib/task-chat";
import { demoApplications, demoEvents } from "@/lib/demo-data";
import { demoContacts } from "@/lib/pipeline";
import { todayISO } from "@/lib/metrics";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const tourHost = read("components/GuidedTour.tsx");
const chatBeat = read("components/landing/ChatBeat.tsx");
const home = read("app/page.tsx");
const layout = read("app/layout.tsx");
const demoNav = read("app/demo/DemoNav.tsx");
const demoDashboard = read("app/demo/DemoDashboard.tsx");
const demoPage = read("app/demo/page.tsx");
const tourLib = read("lib/guided-tour.ts");

describe("tour steps (Pulse-guided walkthrough)", () => {
  it("covers every feature in the order a new user should meet them", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "dashboard",
      "sheet",
      "find-jobs",
      "jobs",
      "leads",
      "networking",
      "chat",
      "connect",
    ]);
  });

  it("sends each step to its own route with a matching spotlight anchor", () => {
    const routes: Record<TourStepId, string> = {
      dashboard: "/demo",
      sheet: "/demo/sheet",
      "find-jobs": "/jobs",
      jobs: "/jobs",
      leads: "/demo/leads",
      networking: "/demo/networking",
      chat: "/demo",
      connect: "/demo/connect",
    };
    for (const step of TOUR_STEPS) {
      expect(step.route).toBe(routes[step.id]);
      expect(step.anchor).toBe(step.id === "chat" ? "ask-pulse" : step.id);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });

  it("keeps Pulse's narration free of em dashes", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title).not.toContain("—");
      expect(step.body).not.toContain("—");
      expect(step.tryIt).not.toContain("—");
    }
  });

  it("gives every step a Try-it label for the hands-on button", () => {
    for (const step of TOUR_STEPS) {
      expect(step.tryIt.startsWith("Try it: ")).toBe(true);
      expect(step.tryIt.length).toBeGreaterThan("Try it: ".length);
    }
  });

  it("resolves the tour param and walks forwards and backwards", () => {
    expect(parseTourStep("sheet")?.id).toBe("sheet");
    expect(parseTourStep("connect")?.id).toBe("connect");
    expect(parseTourStep(null)).toBeNull();
    expect(parseTourStep("bogus")).toBeNull();
    expect(parseTourStep("")).toBeNull();
    const first = TOUR_STEPS[0];
    const last = TOUR_STEPS[TOUR_STEPS.length - 1];
    expect(prevTourStep(first)).toBeNull();
    expect(nextTourStep(last)).toBeNull();
    expect(nextTourStep(first)?.id).toBe("sheet");
    expect(prevTourStep(last)?.id).toBe("chat");
    expect(nextTourStep(parseTourStep("find-jobs")!)?.id).toBe("jobs");
    expect(prevTourStep(parseTourStep("jobs")!)?.id).toBe("find-jobs");
  });

  it("builds step URLs from route + tour param, starting at the dashboard", () => {
    expect(tourHref(TOUR_STEPS[1])).toBe("/demo/sheet?tour=sheet");
    expect(tourHref(TOUR_STEPS[2])).toBe("/jobs?tour=find-jobs");
    expect(tourHref(TOUR_STEPS[6])).toBe("/demo?tour=chat");
    expect(tourStartHref()).toBe("/demo?tour=dashboard");
  });
});

describe("the tour teaches, not just describes", () => {
  const byId = (id: TourStepId) => TOUR_STEPS.find((s) => s.id === id)!;

  it("orients on the nav tabs and the tour order in step 1", () => {
    const body = byId("dashboard").body;
    expect(body).toContain("Dashboard, Sheet, Leads, Networking, then Connect");
    expect(body).toContain("Jobs in the top nav");
  });

  it("says where each feature lives in navigation", () => {
    expect(byId("sheet").body).toContain("Find it under Sheet in the demo nav");
    expect(byId("find-jobs").body).toContain("Find it under Jobs in the top nav");
    expect(byId("leads").body).toContain("Find it under Leads in the demo nav");
    expect(byId("networking").body).toContain("Find it under Networking in the demo nav");
    expect(byId("chat").body).toContain("Find it under Ask Pulse in the top nav");
    expect(byId("connect").body).toContain("Find it under Connect in the demo nav");
  });

  it("names every feature in a step body, so nothing in the tour has no home", () => {
    const all = TOUR_STEPS.map((s) => s.body).join(" ");
    // Dashboard header actions, named on the dashboard step.
    expect(all).toContain("Add application");
    expect(all).toContain("Import sheet");
    expect(all).toContain("Export");
    expect(all).toContain("Settings");
    // Pace chart and funnel, on the dashboard step.
    expect(all).toContain("pace chart");
    expect(all).toContain("funnel");
    // Sheet: status filter, search, edit, Waiting on you toggle, export.
    expect(all).toContain("status dropdown");
    expect(all).toContain("search box");
    expect(all).toContain("Click any editable cell");
    expect(all).toContain("Waiting on you toggle");
    // Jobs: swipe, board, saved list, Applied flow.
    expect(all).toContain("Swipe right to save");
    expect(all).toContain("Saved roles gather");
    // Leads: search, filter, fit note.
    expect(all).toContain("fit note");
    // Networking: follow-ups, search, notes expand.
    expect(all).toContain("Show more");
    // Chat: general answers plus task chat plus Talk to Agent.
    expect(all).toContain("Open a task first");
    expect(all).toContain("Talk to Agent");
    // Connect: token setup for the named clients.
    expect(all).toContain("access token");
    expect(all).toContain("Claude, Cursor or Copilot");
  });

  it("closes the Connect step with where to start and the replay link", () => {
    const body = byId("connect").body;
    expect(body).toContain("Where to start:");
    expect(body).toContain("add one application");
    expect(body).toContain("save one job from Jobs");
    expect(body).toContain("ask Pulse what is due next");
    expect(body).toContain("Replay this tour anytime from Take the tour in the demo nav");
  });
});

describe("card placement (never covers the anchor)", () => {
  it("sits right of a narrow anchor on a wide viewport", () => {
    const p = placeTourCard({ x: 100, y: 100, width: 300, height: 200 }, { width: 1280, height: 800 }, 300);
    expect(p).toEqual({ left: 416, top: 100 });
  });

  it("sits left when the right side has no room", () => {
    const p = placeTourCard({ x: 900, y: 100, width: 300, height: 200 }, { width: 1280, height: 800 }, 300);
    expect(p).toEqual({ left: 504, top: 100 });
  });

  it("sits below a wide anchor when neither side fits", () => {
    const p = placeTourCard({ x: 100, y: 100, width: 1000, height: 200 }, { width: 1280, height: 800 }, 300);
    expect(p).toEqual({ left: 100, top: 316 });
  });

  it("sits above when below runs off the viewport", () => {
    const p = placeTourCard({ x: 100, y: 500, width: 1000, height: 200 }, { width: 1280, height: 800 }, 300);
    expect(p).toEqual({ left: 100, top: 184 });
  });

  it("falls back to the bottom dock for a full-viewport anchor", () => {
    const p = placeTourCard({ x: 0, y: 0, width: 1280, height: 800 }, { width: 1280, height: 800 }, 300);
    expect(p).toBeNull();
  });

  it("never overlaps the anchor on any placement", () => {
    const cases = [
      [{ x: 100, y: 100, width: 300, height: 200 }, { width: 1280, height: 800 }],
      [{ x: 900, y: 100, width: 300, height: 200 }, { width: 1280, height: 800 }],
      [{ x: 100, y: 100, width: 1000, height: 200 }, { width: 1280, height: 800 }],
      [{ x: 100, y: 500, width: 1000, height: 200 }, { width: 1280, height: 800 }],
    ] as const;
    for (const [anchor, viewport] of cases) {
      const p = placeTourCard(anchor, viewport, 300);
      expect(p).not.toBeNull();
      const overlaps =
        p!.left < anchor.x + anchor.width &&
        p!.left + 380 > anchor.x &&
        p!.top < anchor.y + anchor.height &&
        p!.top + 300 > anchor.y;
      expect(overlaps).toBe(false);
    }
  });
});

describe("the chat step shows the real answer, not a typed one", () => {
  it("answers the follow-ups question from the demo data (Marcus then Priya)", () => {
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
    const answer = answerGeneralQuestion("What networking follow-ups are due?", ctx);
    expect(answer.text).toContain("2 follow-ups due");
    expect(answer.text).toContain("Marcus Webb");
    expect(answer.text).toContain("Priya Nair");
    expect(answer.text.indexOf("Marcus Webb")).toBeLessThan(answer.text.indexOf("Priya Nair"));
    expect(answer.text).not.toContain("Sam Ortiz");
  });

  it("shifts the follow-up dates by a day when today shifts a day (UTC server vs local browser)", () => {
    // Nov 17 is the server's UTC date once midnight UTC passes; Nov 16 is
    // the visitor's date in PT at the same moment. The same answer names
    // Nov 15 / Nov 17 from one today and Nov 14 / Nov 16 from the other,
    // which is exactly the one-day split the landing beat and the tour
    // step showed. Both paths must feed the same local today, or the two
    // copies of this answer disagree.
    const ctxFor = (today: string): GeneralChatContext => {
      const apps = demoApplications(today);
      return {
        apps,
        events: demoEvents(apps),
        contacts: demoContacts(today),
        today,
        origin: DEFAULT_APP_ORIGIN,
        ghostDays: 21,
        weeklyGoal: 8,
        trackerPath: "/demo",
      };
    };
    const server = answerGeneralQuestion("What networking follow-ups are due?", ctxFor("2026-11-17"));
    const browser = answerGeneralQuestion("What networking follow-ups are due?", ctxFor("2026-11-16"));
    expect(server.text).toContain("(Nov 15)");
    expect(server.text).toContain("(Nov 17)");
    expect(browser.text).toContain("(Nov 14)");
    expect(browser.text).toContain("(Nov 16)");
  });
});

describe("tour host (spotlight, controls, reduced motion)", () => {
  it("reads the tour param, spotlights the anchor, and offers back / next / skip / exit", () => {
    expect(tourHost).toContain('useSearchParams()');
    expect(tourHost).toContain('parseTourStep(searchParams.get("tour"))');
    expect(tourHost).toContain("data-tour=");
    expect(tourHost).toContain("scrollIntoView");
    expect(tourHost).toContain("Skip tour");
    expect(tourHost).toContain("Exit tour");
    expect(tourHost).toContain("disabled={!prev}");
    expect(tourHost).toContain("tourHref(prev)");
    expect(tourHost).toContain("tourHref(next)");
    expect(tourHost).toContain("Finish");
    expect(tourHost).toContain("Go to step ${i + 1}");
  });

  it("exits on Escape and never smooth-scrolls under reduced motion", () => {
    expect(tourHost).toContain('e.key === "Escape"');
    expect(tourHost).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(tourHost).toContain('behavior: reducedMotion() ? "auto" : "smooth"');
  });

  it("keeps working when an anchor never appears (no ring, tour still runs)", () => {
    expect(tourHost).toContain("tries < 40");
    expect(tourHost).toContain("setRect(null)");
    expect(tourHost).toContain("{rect && (");
  });

  it("shows the live chat answer on the chat step, with a way to try it for real", () => {
    expect(tourHost).toContain("answerGeneralQuestion");
    expect(tourHost).toContain("What networking follow-ups are due?");
    expect(tourHost).toContain('href="/demo?tour=chat&chat=1"');
    expect(tourHost).toContain("Try Ask Pulse yourself");
  });

  it("keeps the card in front of the dim, on a solid background", () => {
    expect(tourHost).toContain("z-[80]");
    expect(tourHost).toContain("tour-card");
    const css = read("app/globals.css");
    expect(css).toContain(".tour-ring {");
    expect(css).toContain("z-index: 1;");
    expect(css).toContain(".tour-card {");
    expect(css).toContain("z-index: 2;");
    expect(css).toContain("background-color: var(--surface);");
  });

  it("is non-modal: the page stays clickable and the card takes only its own clicks", () => {
    expect(tourHost).toContain('className="pointer-events-none fixed inset-0 z-[80]"');
    expect(tourHost).toContain('role="dialog"');
    expect(tourHost).not.toContain('aria-modal="true"');
    expect(tourHost).toContain("pointer-events-auto");
  });

  it("moves the card beside the anchor instead of parking it bottom-right", () => {
    expect(tourHost).toContain("placeTourCard");
    expect(tourHost).toContain("setPlacement");
    expect(tourHost).toContain("window.innerWidth < 640");
    expect(tourHost).toContain("sm:bottom-auto sm:right-auto");
    expect(tourHost).toContain("{ left: placement.left, top: placement.top }");
    const css = read("app/globals.css");
    expect(css).toContain(".tour-card {");
    expect(css).toContain("left 0.25s ease");
    expect(css).toContain("top 0.25s ease");
    expect(css).toContain(".tour-card { transition: none; }");
  });

  it("lets the visitor try the feature: Try-it focuses the anchor and pulses the ring, without advancing", () => {
    expect(tourHost).toContain("step.tryIt");
    expect(tourHost).toContain("Go ahead, try it, the tour stays open.");
    expect(tourHost).toContain("tour-ring-pulse");
    expect(tourHost).toContain("setTimeout(() => setPulsing(false), 1200)");
    expect(tourHost).toContain("querySelector(FOCUSABLE)");
    expect(tourHost).toContain("target.focus({ preventScroll: true })");
    const css = read("app/globals.css");
    expect(css).toContain("@keyframes tour-ring-pulse");
    expect(css).toContain(".tour-ring-pulse {");
    expect(css).toContain("animation: tour-ring-pulse 1.2s ease;");
    expect(css).toContain(".tour-ring-pulse { animation: none; }");
  });

  it("auto-starts on plain /demo only, and never re-prompts a visitor who left", () => {
    expect(TOUR_DISMISSED_KEY).toBe("pulsefind-tour-dismissed");
    expect(tourLib).toContain(`TOUR_DISMISSED_KEY = "${TOUR_DISMISSED_KEY}"`);
    expect(tourHost).toContain("TOUR_DISMISSED_KEY");
    expect(tourHost).toContain('pathname !== "/demo"');
    expect(tourHost).toContain("router.replace(tourStartHref())");
    expect(tourHost).toContain('sessionStorage.setItem(TOUR_DISMISSED_KEY, "1")');
    expect(tourHost).toContain("sessionStorage.removeItem(TOUR_DISMISSED_KEY)");
    expect(tourHost).toContain("sessionStorage.getItem(TOUR_DISMISSED_KEY)");
  });

  it("keeps the tour param when the chat link clears ?chat=1", () => {
    expect(demoPage).toContain("tour?: string | string[]");
    expect(demoPage).toContain('tour={typeof sp.tour === "string" ? sp.tour : undefined}');
    expect(demoDashboard).toContain("tour?: string");
    expect(demoDashboard).toContain("`/demo?tour=${tour}`");
  });

  it("mounts in the root layout inside Suspense, so it runs on every demo route", () => {
    expect(layout).toContain("GuidedTour");
    expect(layout).toContain("<Suspense fallback={null}>");
    expect(layout).toContain("<GuidedTour />");
  });

  it("uses the red accent only, with the ring dimming the rest of the page", () => {
    const css = read("app/globals.css");
    expect(css).toContain(".tour-ring");
    expect(css).toContain("border: 2px solid var(--accent)");
    expect(css).toContain("0 0 0 9999px rgb(13 12 16 / 0.72)");
    expect(css).toContain(".tour-ring { transition: none; }");
  });
});

describe("tour anchors exist on the pages the steps visit", () => {
  it("marks the dashboard, sheet, leads, networking and connect views", () => {
    expect(read("components/dashboard/Overview.tsx")).toContain('data-tour="dashboard"');
    expect(read("components/dashboard/SheetView.tsx")).toContain('data-tour="sheet"');
    expect(read("components/pipeline/LeadsSection.tsx")).toContain('data-tour="leads"');
    expect(read("components/pipeline/NetworkingSection.tsx")).toContain('data-tour="networking"');
    expect(read("app/demo/connect/DemoConnectAgent.tsx")).toContain('data-tour="connect"');
  });

  it("marks the jobs search bar and the swipe deck separately", () => {
    const jobs = read("app/jobs/JobsBoard.tsx");
    expect(jobs).toContain('data-tour="find-jobs"');
    expect(jobs).toContain('data-tour="jobs"');
  });

  it("marks the Ask Pulse button the chat step spotlights", () => {
    expect(read("components/dashboard/Dashboard.tsx")).toContain('data-tour="ask-pulse"');
  });

  it("gives the demo a Take the tour replay entry point", () => {
    expect(demoNav).toContain("Take the tour");
    expect(demoNav).toContain('href="/demo?tour=dashboard"');
  });
});

describe("landing chatbot beat (Watch it work)", () => {
  it("renders under the tour video with the real question and answer", () => {
    expect(home).toContain("<ChatBeat />");
    expect(home).toContain("Watch it work");
    expect(chatBeat).toContain("Ask Pulse, get an answer");
    expect(chatBeat).toContain("What networking follow-ups are due?");
    expect(chatBeat).toContain("answerGeneralQuestion");
    expect(chatBeat).toContain("demoApplications");
    expect(chatBeat).toContain("demoContacts");
    expect(chatBeat).toContain('href="/demo?chat=1"');
    expect(chatBeat).toContain("never guesses");
  });

  it("computes the answer in the browser after mount, not on the server", () => {
    // The server runs on UTC, so a server-rendered "today" is already
    // tomorrow for a visitor west of UTC once midnight UTC passes, while
    // the tour and the demo compute today in the browser. The beat once
    // showed Nov 15 / Nov 17 where the tour step showed Nov 14 / Nov 16.
    expect(chatBeat).toContain('"use client"');
    expect(chatBeat).toContain("useEffect");
    expect(chatBeat).toContain("useState<string | null>(null)");
    expect(chatBeat).toContain("setAnswer(answerGeneralQuestion");
  });
});

describe("hero CTAs (demo tour, jobs, self host, agents)", () => {
  it("carries all four actions with the right destinations", () => {
    expect(home).toContain('href="/demo?tour=dashboard"');
    expect(home).toContain('>Try the live demo<');
    expect(home).toContain('href="/jobs"');
    expect(home).toContain(">Find jobs<");
    expect(home).toContain('href="https://github.com/kumailrizvi890/Pulse-Find#run-it-locally"');
    expect(home).toContain(">Self host<");
    expect(home).toContain('href="/#mcp"');
    expect(home).toContain(">Connect your agents<");
  });

  it("stacks the four buttons full-width on phones and rows them on desktop", () => {
    expect(home).toContain("flex flex-col gap-3 sm:flex-row sm:flex-wrap");
    expect(home).toContain("heroPrimary");
    expect(home).toContain("heroSecondary");
    expect(home).toContain("w-full justify-center sm:w-auto");
  });

  it("drops the old hero buttons (signup and internships live elsewhere)", () => {
    expect(home).not.toContain('href="/login?mode=signup" className={secondary}>Create a free tracker');
    expect(home).not.toContain('>Find internships<');
  });
});

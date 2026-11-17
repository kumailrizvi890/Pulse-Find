import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TOUR_STEPS,
  nextTourStep,
  parseTourStep,
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
    expect(tourHost).toContain('href="/demo?chat=1"');
    expect(tourHost).toContain("Try Ask Pulse yourself");
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

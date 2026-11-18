import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TOUR_BADGES,
  TOUR_PROGRESS_KEY,
  TOUR_RING_RADIUS,
  TOUR_DISMISSED_KEY,
  TOUR_STEPS,
  badgeForStep,
  emptyTourProgress,
  isDemoPath,
  nextTourStep,
  parseTourStep,
  placeTourCard,
  prevTourStep,
  progressAfterCompletion,
  tourHref,
  tourProgressFraction,
  tourRecapLines,
  tourRingDash,
  tourStartHref,
  type TourBadgeId,
  type TourCompletion,
  type TourProgress,
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

describe("tour steps (Pulse-guided quest)", () => {
  it("covers every feature in the order a new user should meet them", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "dashboard",
      "sheet",
      "leads",
      "find-jobs",
      "jobs",
      "networking",
      "chat",
      "connect",
    ]);
  });

  it("sends each step to its own route with a tight spotlight anchor", () => {
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
    // The ring targets the exact control the visitor acts on, not the
    // whole page: the first waiting task, the sheet toolbar, the first
    // row's Edit button, the save heart, the copy button.
    const anchors: Record<TourStepId, string> = {
      dashboard: "waiting-first",
      sheet: "sheet-tools",
      "find-jobs": "find-jobs",
      jobs: "job-save",
      leads: "lead-edit",
      networking: "contact-edit",
      chat: "ask-pulse",
      connect: "connect-copy",
    };
    for (const step of TOUR_STEPS) {
      expect(step.route).toBe(routes[step.id]);
      expect(step.anchor).toBe(anchors[step.id]);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.line.length).toBeGreaterThan(20);
      expect(step.done.length).toBeGreaterThan(0);
    }
  });

  it("gives every step one real action that completes it, and nothing else", () => {
    const completions: Record<TourStepId, TourCompletion> = {
      dashboard: "waiting-open",
      sheet: "sheet-filter",
      "find-jobs": "jobs-search",
      jobs: "jobs-save",
      leads: "lead-edit",
      networking: "contact-edit",
      chat: "chat-ask",
      connect: "connect-copy",
    };
    for (const step of TOUR_STEPS) {
      expect(step.completion).toBe(completions[step.id]);
    }
  });

  it("keeps Pulse's narration free of em dashes, short, and lowercase", () => {
    for (const step of TOUR_STEPS) {
      for (const text of [step.title, step.line, step.done, step.lineAlt, step.doneAlt]) {
        if (text === undefined) continue;
        expect(text).not.toContain("—");
      }
      // One short line at a time, plain lowercase friend voice.
      expect(step.line.length).toBeLessThanOrEqual(120);
      expect(step.done.length).toBeLessThanOrEqual(170);
      expect(step.line[0]).toBe(step.line[0].toLowerCase());
      expect(step.done[0]).toBe(step.done[0].toLowerCase());
    }
  });

  it("has no badges, missions, or achievement screens in the copy", () => {
    const all = TOUR_STEPS.map((s) => `${s.line} ${s.done}`).join(" ");
    expect(all).not.toContain("Mission");
    expect(all).not.toContain("badge");
    expect(all).not.toContain("achievement");
    expect(all).not.toContain("trophy");
    expect(all).not.toContain("congratulations");
    expect(all).not.toContain("Next");
    expect(all).not.toContain("Back");
    expect(all).not.toContain("Try it");
  });

  it("gives the jobs step a signed-in variant: preview, never save a real job", () => {
    const jobs = TOUR_STEPS.find((s) => s.id === "jobs")!;
    expect(jobs.lineAlt).toBe("tap View posting on the top card to peek at the role");
    expect(jobs.doneAlt).toBe("that's the one, the posting opens right from the card");
    expect(jobs.anchorAlt).toBe("job-posting");
    expect(jobs.line).toContain("tap the green check button under the card");
    // No other step needs a mode variant.
    for (const step of TOUR_STEPS) {
      if (step.id === "jobs") continue;
      expect(step.lineAlt).toBeUndefined();
      expect(step.doneAlt).toBeUndefined();
      expect(step.anchorAlt).toBeUndefined();
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
    expect(tourHref(TOUR_STEPS[2])).toBe("/demo/leads?tour=leads");
    expect(tourHref(TOUR_STEPS[3])).toBe("/jobs?tour=find-jobs");
    expect(tourHref(TOUR_STEPS[6])).toBe("/demo?tour=chat");
    expect(tourStartHref()).toBe("/demo?tour=dashboard");
  });

  it("knows which routes are demo routes (sample data may be written there)", () => {
    expect(isDemoPath("/demo")).toBe(true);
    expect(isDemoPath("/demo/sheet")).toBe(true);
    expect(isDemoPath("/demo/leads")).toBe(true);
    expect(isDemoPath("/demo/networking")).toBe(true);
    expect(isDemoPath("/demo/connect")).toBe(true);
    expect(isDemoPath("/jobs")).toBe(false);
    expect(isDemoPath("/app")).toBe(false);
    expect(isDemoPath("/")).toBe(false);
  });
});

describe("the tour teaches one real action per stop", () => {
  const byId = (id: TourStepId) => TOUR_STEPS.find((s) => s.id === id)!;

  it("orients on home in step 1", () => {
    expect(byId("dashboard").line).toContain("this is home");
  });

  it("names the one action to try in every line", () => {
    expect(byId("dashboard").line).toContain("tap Open on the first waiting task");
    expect(byId("sheet").line).toContain("Status dropdown in the toolbar above the sheet");
    expect(byId("find-jobs").line).toContain("type a company or a role in the search box at the top of the jobs page");
    expect(byId("jobs").line).toContain("tap the green check button under the card");
    expect(byId("leads").line).toContain("tap Edit on the first lead row");
    expect(byId("networking").line).toContain("tap Edit on the first contact row");
    expect(byId("chat").line).toContain("tap Ask Pulse in the top bar");
    expect(byId("chat").line).toContain("i never guess");
    expect(byId("connect").line).toContain("tap Copy full prompt under step 4");
    expect(byId("connect").line).toContain("claude, cursor or copilot");
  });

  it("closes the Connect step with where to start and the replay link", () => {
    const done = byId("connect").done;
    expect(done).toContain("start with one application");
    expect(done).toContain("one saved job");
    expect(done).toContain("ask me what's due next");
    expect(done).toContain("replay anytime from take the tour in the demo nav");
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

describe("the chat answer itself (used by the real chat panel, not the tour coach)", () => {
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

describe("tour host (quest coach: no action buttons, advance only on the real action)", () => {
  it("reads the tour param, spotlights the anchor, and offers only dots, skip, and exit", () => {
    expect(tourHost).toContain('useSearchParams()');
    expect(tourHost).toContain('parseTourStep(searchParams.get("tour"))');
    expect(tourHost).toContain("data-tour=");
    expect(tourHost).toContain("scrollIntoView");
    expect(tourHost).toContain("Skip tour");
    expect(tourHost).toContain("Exit tour");
    expect(tourHost).toContain("Done");
    expect(tourHost).toContain("Go to step ${i + 1}");
    // The coach has zero action buttons: no Next, no Back, no Try-it,
    // no Finish, no precomputed chat answer.
    expect(tourHost).not.toContain(">Next<");
    expect(tourHost).not.toContain(">Back<");
    expect(tourHost).not.toContain("Try it");
    expect(tourHost).not.toContain("tryIt");
    expect(tourHost).not.toContain(">Finish<");
    expect(tourHost).not.toContain("answerGeneralQuestion");
    expect(tourHost).not.toContain("Try Ask Pulse yourself");
    expect(tourHost).not.toContain('href="/demo?tour=chat&chat=1"');
    expect(tourHost).not.toContain("demoApplications");
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

  it("advances only when the visitor does the real thing, after a beat", () => {
    // One detector per completion kind, each scoped to its own feature.
    for (const kind of [
      "waiting-open",
      "sheet-filter",
      "jobs-search",
      "jobs-save",
      "lead-edit",
      "contact-edit",
      "chat-ask",
      "connect-copy",
    ]) {
      expect(tourHost).toContain(`case "${kind}":`);
    }
    expect(tourHost).toContain('data-tour-action="waiting-open"');
    expect(tourHost).toContain('data-tour-action="waiting-all"');
    expect(tourHost).toContain('aria-label") === "Filter by status"');
    expect(tourHost).toContain('t.id === "job-search"');
    expect(tourHost).toContain('[data-tour="job-save"]');
    expect(tourHost).toContain(".pf-chat-bubble-user-3d");
    expect(tourHost).toContain('startsWith("Copy")');
    // The advance is a timer after the action, never a button press,
    // and it waits for any open dialog to close first, so the visitor
    // reads the drawer or the edit form before the page changes.
    expect(tourHost).toContain("TOUR_ADVANCE_MS");
    expect(tourHost).toContain("nextTourStep(step)");
    expect(tourHost).toContain("tourHref(next)");
    expect(tourHost).toContain("if (overlayOpen) return;");
    expect(tourHost).toContain("do the thing and the tour moves on");
  });

  it("bursts the crystal and pulses the ring when the action lands", () => {
    expect(tourHost).toContain("PulseCrystal");
    expect(tourHost).toContain("tour-crystal");
    expect(tourHost).toContain("tour-crystal-burst");
    expect(tourHost).toContain("tour-ring-pulse");
    expect(tourHost).toContain("setTimeout(() => setPulsing(false), 1200)");
    const css = read("app/globals.css");
    expect(css).toContain("@keyframes tour-crystal-float");
    expect(css).toContain("@keyframes tour-crystal-burst");
    expect(css).toContain(".tour-crystal {");
    expect(css).toContain(".tour-crystal-burst {");
    expect(css).toContain(".tour-bubble {");
    expect(css).toContain(".tour-bubble::before");
    expect(css).toContain("@keyframes tour-ring-pulse");
    expect(css).toContain(".tour-ring-pulse {");
    expect(css).toContain("animation: tour-ring-pulse 1.2s ease;");
    // Reduced motion kills the float, the burst, and the ring pulse.
    expect(css).toContain(".tour-crystal { animation: none; }");
    expect(css).toContain(".tour-crystal-burst { animation: none; }");
    expect(css).toContain(".tour-ring-pulse { animation: none; }");
  });

  it("is a phone-first bottom sheet, never more than ~35% of the viewport", () => {
    expect(tourHost).toContain("max-h-[35dvh]");
    expect(tourHost).toContain("inset-x-3 bottom-3");
    expect(tourHost).toContain("overflow-y-auto");
  });

  it("steps aside entirely when a dialog opens over the page", () => {
    // The chat panel, the task drawer, and the lead/contact edit forms
    // are all role="dialog" aria-modal="true". The tour's own coach is
    // a dialog too, but never aria-modal, so it never matches. A slim
    // bar on top was tried and caught clicks on the drawer's Close
    // button, so the coach hides instead and resumes when the dialog
    // closes, following the floating assistant's convention.
    expect(tourHost).toContain('[role="dialog"][aria-modal="true"]');
    expect(tourHost).toContain("overlayOpen");
    expect(tourHost).toContain("if (compact) return null;");
    expect(tourHost).toContain('className="pointer-events-none fixed inset-0 z-[80]" role="dialog" aria-labelledby="tour-line"');
    expect(tourHost).not.toContain("inset-x-3 top-3");
  });

  it("is non-modal: the page stays clickable and the coach takes only its own clicks", () => {
    expect(tourHost).toContain('className="pointer-events-none fixed inset-0 z-[80]"');
    expect(tourHost).toContain('role="dialog"');
    expect(tourHost).toContain("pointer-events-auto");
  });

  it("keeps the coach in front of the ring, on a solid background, with no dim anywhere", () => {
    expect(tourHost).toContain("z-[80]");
    expect(tourHost).toContain("tour-card");
    const css = read("app/globals.css");
    expect(css).toContain(".tour-ring {");
    expect(css).toContain("z-index: 1;");
    expect(css).toContain(".tour-card {");
    expect(css).toContain("z-index: 2;");
    expect(css).toContain("background-color: var(--surface);");
    // The dim is gone: no 9999px backdrop in the ring or its pulse.
    // (9999px still appears as border-radius on fully-rounded pills,
    // which is unrelated.)
    expect(css).not.toContain("0 0 0 9999px");
    expect(css).toContain("border: 3px solid var(--accent)");
    expect(css).toContain(".tour-ring { transition: none; animation: none; }");
  });

  it("moves the coach beside the anchor instead of parking it bottom-right", () => {
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

  it("reads the signed-in mode once, and previews instead of saving when signed in", () => {
    expect(tourHost).toContain("getSession");
    expect(tourHost).toContain("signedIn");
    expect(tourHost).toContain("anchorAlt");
    expect(tourHost).toContain('a[target="_blank"]');
    expect(tourHost).toContain("step.lineAlt");
    expect(tourHost).toContain("step.doneAlt");
    expect(tourHost).toContain("step.anchorAlt");
    // The save toast is the catch-all for swipe and keyboard saves.
    expect(tourHost).toContain('startsWith("Saved")');
  });

  it("never performs a mutation: it only watches, never saves, dismisses, or sends", () => {
    expect(tourHost).not.toContain("saveLead");
    expect(tourHost).not.toContain("setMark");
    expect(tourHost).not.toContain("promote(");
    expect(tourHost).not.toContain("markDone");
    expect(tourHost).not.toContain("store.update");
    expect(tourHost).not.toContain("store.create");
    expect(tourHost).not.toContain("addEvent(");
    expect(tourHost).not.toContain("onDone");
    expect(tourHost).not.toContain("decide(");
    expect(tourHost).not.toContain("mark(");
    expect(tourHost).not.toContain("removeSaved");
    expect(tourHost).not.toContain("deleteApplication");
    // The dashboard step accepts Open and View-all, never Done.
    expect(tourHost).not.toContain('data-tour-action="waiting-done"');
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

  it("does not auto-start the tour when the visitor arrives to chat (?chat=1)", () => {
    // The landing chat button and the demo nav link here with ?chat=1:
    // the chat takes precedence, so the tour coach never sits over the
    // open chat panel. The gate sits before the auto-start replace.
    const gate = tourHost.indexOf('searchParams.get("chat") === "1"');
    const start = tourHost.indexOf("router.replace(tourStartHref())");
    expect(gate).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(start);
    // DemoDashboard clears ?chat=1 right after the chat opens, so the
    // decision is made once per mount, not re-read from the live param.
    expect(tourHost).toContain("autoStartChecked");
  });

  it("stays startable by hand after a ?chat=1 arrival", () => {
    // "Take the tour" forces step 1 even after a suppressed auto-start:
    // an arrival with a ?tour= param clears the dismissed flag, and the
    // nav link carries one.
    expect(demoNav).toContain("Take the tour");
    expect(demoNav).toContain('href="/demo?tour=dashboard"');
    expect(tourHost).toContain("sessionStorage.removeItem(TOUR_DISMISSED_KEY)");
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
});

describe("tour rewards (Nov 17: guidance-first, earned only by real actions)", () => {
  it("has exactly the three badges from the Nov 17 design, one per key step", () => {
    expect(TOUR_BADGES.map((b) => b.id)).toEqual(["inbox-zero", "explorer", "networker"]);
    expect(TOUR_BADGES.map((b) => b.name)).toEqual(["Inbox Zero", "Explorer", "Networker"]);
    const earnedBy: Record<TourBadgeId, TourStepId> = {
      "inbox-zero": "dashboard",
      explorer: "find-jobs",
      networker: "networking",
    };
    for (const badge of TOUR_BADGES) {
      expect(badge.earnedBy).toBe(earnedBy[badge.id]);
      expect(badge.blurb.length).toBeGreaterThan(0);
      expect(badge.blurb).not.toContain("—");
    }
    // No other step earns a badge.
    for (const step of TOUR_STEPS) {
      if (step.id === "dashboard" || step.id === "find-jobs" || step.id === "networking") continue;
      expect(badgeForStep(step.id)).toBeUndefined();
    }
    expect(badgeForStep("dashboard")?.id).toBe("inbox-zero");
    expect(badgeForStep("find-jobs")?.id).toBe("explorer");
    expect(badgeForStep("networking")?.id).toBe("networker");
  });

  it("records a step once and its badge once, and never duplicates on replay", () => {
    const empty = emptyTourProgress();
    expect(empty).toEqual({ steps: [], badges: [] });
    const afterDashboard = progressAfterCompletion(empty, "dashboard");
    expect(afterDashboard).toEqual({ steps: ["dashboard"], badges: ["inbox-zero"] });
    const again = progressAfterCompletion(afterDashboard, "dashboard");
    expect(again).toEqual({ steps: ["dashboard"], badges: ["inbox-zero"] });
    const noBadge = progressAfterCompletion(afterDashboard, "sheet");
    expect(noBadge).toEqual({ steps: ["dashboard", "sheet"], badges: ["inbox-zero"] });
    let all: TourProgress = emptyTourProgress();
    for (const step of TOUR_STEPS) all = progressAfterCompletion(all, step.id);
    expect(all.steps).toHaveLength(8);
    expect(all.badges).toEqual(["inbox-zero", "explorer", "networker"]);
    expect(tourProgressFraction(all)).toBe(1);
    expect(tourProgressFraction(empty)).toBe(0);
    expect(tourProgressFraction({ steps: ["dashboard", "sheet"], badges: ["inbox-zero"] })).toBe(0.25);
  });

  it("sizes the progress ring from the step fraction", () => {
    const circumference = 2 * Math.PI * TOUR_RING_RADIUS;
    expect(TOUR_RING_RADIUS).toBe(26);
    expect(tourRingDash(0).dasharray).toBe(circumference.toFixed(2));
    expect(tourRingDash(0).dashoffset).toBe(circumference.toFixed(2));
    expect(tourRingDash(1).dashoffset).toBe("0.00");
    expect(tourRingDash(0.5).dashoffset).toBe((circumference * 0.5).toFixed(2));
    expect(tourRingDash(2).dashoffset).toBe("0.00");
    expect(tourRingDash(-1).dashoffset).toBe(circumference.toFixed(2));
  });

  it("recaps what was done, in tour order, with the signed-in jobs variant", () => {
    const all = TOUR_STEPS.map((s) => s.id);
    const demo = tourRecapLines(all, false);
    expect(demo).toEqual([
      "opened a waiting task",
      "filtered the sheet by stage",
      "opened a lead",
      "searched fresh roles",
      "saved a job to your leads",
      "opened a due contact",
      "asked Pulse what is due next",
      "copied the agent prompt",
    ]);
    const signedIn = tourRecapLines(all, true);
    expect(signedIn[4]).toBe("peeked at a posting");
    expect(tourRecapLines(["networking", "dashboard"], false)).toEqual([
      "opened a waiting task",
      "opened a due contact",
    ]);
    for (const line of demo) {
      expect(line).not.toContain("—");
      expect(line[0]).toBe(line[0].toLowerCase());
    }
  });

  it("keeps the narration free of badge and achievement words (rewards live in chips, not copy)", () => {
    const all = TOUR_STEPS.map((s) => `${s.line} ${s.done}`).join(" ");
    expect(all).not.toContain("badge");
    expect(all).not.toContain("achievement");
    expect(all).not.toContain("trophy");
    expect(all).not.toContain("congratulations");
    expect(all).not.toContain("Mission");
  });

  it("persists progress in localStorage under its own key", () => {
    expect(TOUR_PROGRESS_KEY).toBe("pulsefind-tour-progress");
    expect(tourHost).toContain("TOUR_PROGRESS_KEY");
    expect(tourHost).toContain("localStorage.getItem(TOUR_PROGRESS_KEY)");
    expect(tourHost).toContain("localStorage.setItem(TOUR_PROGRESS_KEY");
    expect(tourHost).toContain("progressAfterCompletion(progress, step.id)");
    expect(tourHost).toContain("readTourProgress()");
    expect(tourHost).toContain("writeTourProgress(next)");
  });

  it("renders the progress ring, the badge chips, the count, and the recap", () => {
    expect(tourHost).toContain("tour-progress-ring");
    expect(tourHost).toContain("tourProgressFraction(progress)");
    expect(tourHost).toContain("tourRingDash(");
    expect(tourHost).toContain("tour-badge");
    expect(tourHost).toContain("tour-badge-pop");
    expect(tourHost).toContain("Badges earned by doing the tour steps");
    expect(tourHost).toContain("progress.steps.length}/{TOUR_STEPS.length}");
    expect(tourHost).toContain("tourRecapLines(progress.steps, signedIn)");
    expect(tourHost).toContain("you did all of it");
    expect(tourHost).toContain("here is what you did");
    expect(tourHost).toContain("badges: {earnedBadges");
  });

  it("makes the coach unmissable: halo, entrance, and an idle-pulsing ring", () => {
    expect(tourHost).toContain("tour-crystal-halo");
    expect(tourHost).toContain("tour-card-enter");
    const css = read("app/globals.css");
    expect(css).toContain("@keyframes tour-crystal-halo");
    expect(css).toContain(".tour-crystal-halo {");
    expect(css).toContain("@keyframes tour-card-enter");
    expect(css).toContain(".tour-card-enter {");
    expect(css).toContain("@keyframes tour-ring-idle");
    expect(css).toContain("animation: tour-ring-idle 2s ease-in-out infinite;");
    expect(css).toContain("@keyframes tour-badge-pop");
    expect(css).toContain(".tour-badge {");
    expect(css).toContain(".tour-progress-ring-track {");
    expect(css).toContain(".tour-progress-ring-fill {");
    // Reduced motion kills the new motion too.
    expect(css).toContain(".tour-crystal-halo { animation: none; }");
    expect(css).toContain(".tour-card-enter { animation: none; }");
    expect(css).toContain(".tour-badge-pop { animation: none; }");
    expect(css).toContain(".tour-ring { transition: none; animation: none; }");
  });

  it("scrolls the anchor into view once per step and tracks the ring by direct DOM writes", () => {
    expect(tourHost).toContain("scrolledForRef");
    expect(tourHost).toContain("scrollOnce(el)");
    expect(tourHost).toContain('block: "center"');
    expect(tourHost).toContain("ringRef");
    expect(tourHost).toContain("applyRingRect");
    expect(tourHost).toContain("ring.style.left =");
    expect(tourHost).toContain("ring.style.top =");
    expect(tourHost).toContain("SCROLL_SETTLE_MS");
    // The ring no longer chases the anchor through a CSS transition:
    // it snaps by direct DOM writes on every scroll frame.
    const css = read("app/globals.css");
    expect(css).not.toMatch(/\.tour-ring \{[^}]*transition:\s*left/);
    expect(css).not.toMatch(/\.tour-ring \{[^}]*transition:\s*top/);
  });

  it("delegates every completion detector from the document, so a mid-step reload still completes", () => {
    // The old shape attached listeners to elements found once on
    // mount, so a reload left the step deaf until the visitor
    // re-entered it through the dots. Delegation works for targets
    // that render after the tour mounts.
    expect(tourHost).toContain('on(document, "click", fn)');
    expect(tourHost).toContain('on(document, "change", fn)');
    expect(tourHost).toContain('on(document, "input", fn)');
    expect(tourHost).toContain("within(e, '[data-tour=\"waiting\"]')");
    expect(tourHost).toContain("within(e, '[data-tour=\"sheet\"]')");
    expect(tourHost).toContain("within(e, '[data-tour=\"find-jobs\"]')");
    expect(tourHost).toContain("within(e, '[data-tour=\"jobs\"]')");
    expect(tourHost).toContain("within(e, '[data-tour=\"leads\"]')");
    expect(tourHost).toContain("within(e, '[data-tour=\"networking\"]')");
    expect(tourHost).not.toContain('document.querySelector(\'[data-tour="waiting"]\')');
    expect(tourHost).not.toContain('document.querySelector(\'[data-tour="sheet"]\')');
    expect(tourHost).not.toContain('document.querySelector(\'[data-tour="find-jobs"]\')');
    expect(tourHost).not.toContain('document.querySelector(\'[data-tour="leads"]\')');
    expect(tourHost).not.toContain('document.querySelector(\'[data-tour="networking"]\')');
  });
});

describe("tour anchors exist on the pages the steps visit", () => {
  it("marks the tight spotlight targets the ring follows", () => {
    expect(read("components/dashboard/Overview.tsx")).toContain('dataTour="waiting"');
    expect(read("components/dashboard/Overview.tsx")).toContain('"waiting-first"');
    expect(read("components/dashboard/Overview.tsx")).toContain('data-tour-action="waiting-open"');
    expect(read("components/dashboard/Overview.tsx")).toContain('data-tour-action="waiting-all"');
    expect(read("components/dashboard/SheetView.tsx")).toContain('data-tour="sheet-tools"');
    expect(read("components/pipeline/LeadsSection.tsx")).toContain('"lead-edit"');
    expect(read("components/pipeline/NetworkingSection.tsx")).toContain('"contact-edit"');
    expect(read("app/demo/connect/DemoConnectAgent.tsx")).toContain('data-tour="connect-copy"');
    expect(read("app/jobs/SwipeDeck.tsx")).toContain('data-tour="job-save"');
    expect(read("app/jobs/SwipeDeck.tsx")).toContain('"job-posting"');
  });

  it("keeps the page-level anchors the detectors listen inside", () => {
    expect(read("components/dashboard/Overview.tsx")).toContain('data-tour="dashboard"');
    expect(read("components/dashboard/SheetView.tsx")).toContain('data-tour="sheet"');
    expect(read("components/pipeline/LeadsSection.tsx")).toContain('data-tour="leads"');
    expect(read("components/pipeline/NetworkingSection.tsx")).toContain('data-tour="networking"');
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

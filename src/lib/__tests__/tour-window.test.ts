import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TOUR_CONNECT_HREF,
  TOUR_DECK_SIZE,
  TOUR_DONE_KEY,
  TOUR_FALLBACK_JOBS,
  TOUR_JOBS_STEP,
  TOUR_STEPS,
  TOUR_TOTAL_STEPS,
  badgeSwipeText,
  buildTourQueue,
  deckDoneText,
  isTourDone,
  markTourDone,
  shouldAutoStartTour,
} from "@/lib/tour-window";

// The tour window (Nov 19 2026 redesign): Pulse tours a new visitor
// around in one small draggable window, 8 stops, tap Next to advance.
// Only the jobs stop asks for a real action (the real swipe deck), and
// its saves always go through the demo/local job picks, never through
// Supabase. The finale has ONLY the Connect button to /signup. The old
// quest tour (guided-tour.ts, GuidedTour.tsx, ?tour= plumbing) is gone.

const root = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const tourWindow = read("components/TourWindow.tsx");
const tourLib = read("lib/tour-window.ts");
const layout = read("app/layout.tsx");
const home = read("app/page.tsx");
const css = read("app/globals.css");

describe("the 8 steps, verbatim and in order", () => {
  it("has exactly 8 steps with the approved copy", () => {
    expect(TOUR_TOTAL_STEPS).toBe(8);
    expect(TOUR_STEPS).toHaveLength(8);
    expect(TOUR_STEPS).toEqual([
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
    ]);
  });

  it("renders the step copy from the same definitions", () => {
    expect(tourWindow).toContain("const stepDef = TOUR_STEPS[step - 1];");
    expect(tourWindow).toContain("TOUR_STEPS[step - 1].bubbleTitle");
    expect(tourWindow).toContain("TOUR_STEPS[step - 1].bubbleText");
    expect(tourWindow).toContain("stepDef.hint");
    expect(tourWindow).toContain("stepDef.tag");
    expect(tourWindow).toContain("stepDef.title");
    expect(tourWindow).toContain("Step {step} of {TOUR_TOTAL_STEPS}");
  });
});

describe("the finale has ONLY the Connect button, to /signup", () => {
  it("points Connect at /signup, never at the demo connect page", () => {
    expect(TOUR_CONNECT_HREF).toBe("/signup");
    expect(tourWindow).toContain("href={TOUR_CONNECT_HREF}");
    expect(tourWindow).not.toContain("/demo/connect");
    expect(tourWindow).not.toContain("demo/connect");
  });

  it("hides the footer and the install row on the finale", () => {
    expect(tourWindow).toContain("{!isFinale && (");
    // The install row and the Restart link live inside the
    // not-finale block, so the finale shows Connect and nothing else.
    const footer = tourWindow.slice(tourWindow.indexOf("{!isFinale && ("));
    expect(footer).toContain("Get the app");
    expect(footer).toContain("Restart the tour");
    const finale = tourWindow.slice(tourWindow.indexOf("case 8:"), tourWindow.indexOf("default:"));
    expect(finale).toContain("href={TOUR_CONNECT_HREF}");
    expect(finale).not.toContain("Get the app");
    expect(finale).not.toContain("Restart the tour");
  });
});

describe("Next gating on the jobs stop", () => {
  it("locks Next until all 3 cards are decided", () => {
    expect(TOUR_JOBS_STEP).toBe(4);
    expect(TOUR_DECK_SIZE).toBe(3);
    expect(tourWindow).toContain('disabled={!nextEnabled}');
    expect(tourWindow).toContain('"Swipe to continue"');
    expect(tourWindow).toContain("const deckCleared = decisions.length >= TOUR_DECK_SIZE;");
    expect(tourWindow).toContain("if (n > TOUR_JOBS_STEP && !deckCleared) return;");
  });

  it("counts a drag, a Save/Pass button, and an Undo through the same decisions", () => {
    expect(tourWindow).toContain("onDecide={handleDecide}");
    expect(tourWindow).toContain("onUndo={handleUndo}");
    expect(tourWindow).toContain("canUndo={decisions.length > 0}");
    expect(tourWindow).toContain("setDecisions(next)");
    expect(tourWindow).toContain("setDecisions(decisions.slice(0, -1))");
  });

  it("shows the deck-cleared feedback once all 3 are decided", () => {
    expect(tourWindow).toContain("Deck cleared. Nice swiping!");
    expect(tourWindow).toContain("TOUR_DECK_CLEARED_BUBBLE");
    expect(tourWindow).toContain("deckDoneText(savedCount)");
    expect(tourWindow).toContain("In your Leads");
    expect(deckDoneText(2)).toBe("You saved 2 jobs. They are in your Leads, ready to go!");
    expect(deckDoneText(1)).toBe("You saved 1 job. They are in your Leads, ready to go!");
    expect(deckDoneText(0)).toBe("Passed them all? Bold. Fresh ones drop tomorrow.");
    expect(badgeSwipeText(2)).toBe("Saved 2 jobs to Leads");
    expect(badgeSwipeText(1)).toBe("Saved 1 job to Leads");
    expect(badgeSwipeText(0)).toBe("Passed the whole deck");
  });
});

describe("auto-start: front door, signed out, once only", () => {
  it("starts only for a signed-out visitor who has not done the tour, on /", () => {
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/" })).toBe(true);
    expect(shouldAutoStartTour({ signedIn: true, completed: false, pathname: "/" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: true, pathname: "/" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/demo" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/jobs" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/login" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: null })).toBe(false);
  });

  it("reads the session with a timeout that defaults to signed-in (safe mode)", () => {
    expect(tourWindow).toContain("createClient().auth.getSession()");
    expect(tourWindow).toContain("}, 2000);");
    expect(tourWindow).toContain("shouldAutoStartTour({ signedIn, completed, pathname })");
    expect(tourWindow).not.toContain('router.replace("/app")');
  });

  it("uses one completion flag, set on finale, Connect, or dismiss", () => {
    expect(TOUR_DONE_KEY).toBe("pulsefind-tour-v2");
    expect(tourLib).toContain('localStorage.setItem(TOUR_DONE_KEY, "done")');
    // Node has no localStorage: the helpers never throw, and read as
    // not done.
    expect(() => markTourDone()).not.toThrow();
    expect(isTourDone()).toBe(false);
    // Dismissing counts as done: closeTour marks it before closing.
    const close = tourWindow.slice(tourWindow.indexOf("const closeTour"));
    expect(close).toContain("markTourDone();");
    expect(tourWindow).toContain("if (open && isFinale) markTourDone();");
  });
});

describe("the deck: real cards, demo-mode saves, fictional fallback", () => {
  it("fetches the same 3 jobs as the board, then falls back to fiction", () => {
    expect(tourWindow).toContain('.from("jobs")');
    expect(tourWindow).toContain('.eq("track", "Internship")');
    expect(tourWindow).toContain('.eq("tech", true)');
    expect(tourWindow).toContain('.limit(TOUR_DECK_SIZE)');
    expect(tourWindow).toContain('.order("posted_at"');
    expect(tourWindow).toContain("buildTourQueue(live)");
    expect(tourWindow).toContain("<SwipeDeck");
    expect(tourWindow).toContain("loading={deckLoading}");
  });

  it("saves through the demo/local job picks, never through Supabase", () => {
    expect(tourWindow).toContain('import { readJobPicks, removeJobPick, writeJobPicks } from "@/lib/job-picks";');
    expect(tourWindow).toContain("writeJobPicks(");
    expect(tourWindow).not.toContain("accountPipelineStore");
    expect(tourWindow).not.toContain("createLead");
    expect(tourWindow).not.toContain(".from(\"saved_jobs\")");
    expect(tourWindow).not.toContain(".from(\"leads\")");
  });

  it("undo forgets only a pick the tour itself added", () => {
    expect(tourWindow).toContain("wasAlreadySaved");
    expect(tourWindow).toContain('if (last.choice === "saved" && !last.wasAlreadySaved) removeJobPick(last.job.id);');
  });

  it("opens a posting in a new tab, and has nothing to open for a fictional job", () => {
    expect(tourWindow).toContain('window.open(job.url, "_blank", "noopener,noreferrer")');
    expect(tourWindow).toContain("if (!job.url) return;");
  });

  it("falls back to the preview's three fictional roles", () => {
    expect(TOUR_FALLBACK_JOBS).toHaveLength(3);
    expect(TOUR_FALLBACK_JOBS.map((j) => j.company)).toEqual(["Stripe", "Databricks", "Figma"]);
    for (const job of TOUR_FALLBACK_JOBS) {
      expect(job.track).toBe("Internship");
      expect(job.tech).toBe(true);
      expect(job.url).toBe("");
    }
  });

  it("always builds a 3-card deck, topping live jobs up with fiction", () => {
    const live = TOUR_FALLBACK_JOBS.slice(0, 1).map((j) => ({ ...j, id: "live-1", company: "Live Co" }));
    expect(buildTourQueue(live)).toHaveLength(3);
    expect(buildTourQueue(live)[0].id).toBe("live-1");
    expect(buildTourQueue([])).toEqual(TOUR_FALLBACK_JOBS);
    expect(buildTourQueue(TOUR_FALLBACK_JOBS)).toEqual(TOUR_FALLBACK_JOBS);
  });
});

describe("the window mechanics", () => {
  it("is a centered modal dialog with a backdrop that never closes on click", () => {
    expect(tourWindow).toContain('role="dialog"');
    expect(tourWindow).toContain('aria-modal="true"');
    expect(tourWindow).toContain("max-h-[92dvh]");
    expect(tourWindow).toContain("overflow-y-auto");
    expect(tourWindow).toContain("z-[80]");
    // The backdrop div carries no click handler at all: the only close
    // paths are the X button, Escape, and Connect.
    expect(tourWindow).toContain(
      '<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[2px]">',
    );
    expect(tourWindow).toContain('aria-label="Close tour"');
  });

  it("locks body scroll while open and restores it on close", () => {
    expect(tourWindow).toContain('document.body.style.overflow = "hidden"');
    expect(tourWindow).toContain("document.body.style.overflow = prev;");
  });

  it("drags by the title bar, clamped, with a close button that never drags", () => {
    expect(tourWindow).toContain("Math.max(-160, Math.min(160,");
    expect(tourWindow).toContain("Math.max(-60, Math.min(120,");
    expect(tourWindow).toContain('if ((e.target as HTMLElement).closest("button")) return;');
    expect(tourWindow).toContain("pulse-find");
    expect(tourWindow).toContain("LIVE TOUR");
  });

  it("advances on arrows, never past a locked Next, and closes on Escape", () => {
    expect(tourWindow).toContain('if (e.key === "Escape")');
    expect(tourWindow).toContain('if (e.key === "ArrowRight" && nextEnabled) goTo(step + 1);');
    expect(tourWindow).toContain('else if (e.key === "ArrowLeft" && step > 1) goTo(step - 1);');
  });

  it("reuses PulseCrystal with a tap burst, and opens manually from any demo page", () => {
    expect(tourWindow).toContain('import { PulseCrystal, PulseDot } from "@/components/PulseBrand";');
    expect(tourWindow).toContain("TOUR_SPARK_GLYPHS");
    expect(tourWindow).toContain("aria-label=\"Tap Pulse for a sparkle burst\"");
    expect(tourWindow).toContain('window.addEventListener(OPEN_TOUR_EVENT, onOpen)');
    expect(tourWindow).toContain("export function TakeTourButton");
    expect(tourLib).toContain('OPEN_TOUR_EVENT = "pulsefind:open-tour"');
  });

  it("announces open/close so the floating button and the install pill can hide", () => {
    expect(tourWindow).toContain('window.dispatchEvent(new CustomEvent(TOUR_OPEN_EVENT))');
    expect(tourWindow).toContain('window.dispatchEvent(new CustomEvent(TOUR_CLOSE_EVENT))');
  });
});

describe("disabled buttons look muted, never bright", () => {
  it("mutes the disabled Next and drops its glow", () => {
    expect(tourWindow).toContain("disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none");
    expect(tourWindow).toContain('nextEnabled ? "pf-tour-next-glow" : ""');
  });

  it("mutes Back on step 1", () => {
    expect(tourWindow).toContain("disabled:cursor-default disabled:opacity-35");
  });

  it("disables and mutes the dot buttons past the locked jobs gate", () => {
    expect(tourWindow).toContain("const locked = i + 1 > TOUR_JOBS_STEP && !deckCleared;");
    expect(tourWindow).toContain("disabled={locked}");
    expect(tourWindow).toContain("cursor-not-allowed border-line bg-surface-2 text-faint opacity-40");
  });

  it("renders every decorative panel button as a muted ghost, never bright red", () => {
    // Open, Open Sheet view, Export .xlsx, Talk to Agent: all
    // unclickable, so all ghost-style with disabled + aria-disabled +
    // tabindex -1. The bright red in the preview was a deliberate
    // deviation: a bright button that does nothing confuses users.
    const def = tourWindow.slice(
      tourWindow.indexOf("const DECORATIVE_BTN ="),
      tourWindow.indexOf(";", tourWindow.indexOf("const DECORATIVE_BTN =")),
    );
    expect(def).toContain("bg-transparent");
    expect(def).toContain("text-muted");
    expect(def).toContain("opacity-60");
    expect(def).not.toContain("bg-accent");
    const decorative = tourWindow.match(/disabled aria-disabled="true" tabIndex={-1}/g) ?? [];
    expect(decorative.length).toBeGreaterThanOrEqual(4);
    for (const label of ["Open", "Open Sheet view", "Export .xlsx", "Talk to Agent"]) {
      expect(tourWindow).toContain(label);
    }
  });

  it("keeps the finale Connect bright red: it is a real working link", () => {
    const finale = tourWindow.slice(tourWindow.indexOf("case 8:"), tourWindow.indexOf("default:"));
    expect(finale).toContain("bg-accent");
    expect(finale).toContain("href={TOUR_CONNECT_HREF}");
  });
});

describe("install is visible in the tour, one tap away", () => {
  it("carries a Get the app control on steps 1-7, never the finale", () => {
    expect(tourWindow).toContain("Get the app");
    expect(tourWindow).toContain("promptInstall()");
    expect(tourWindow).toContain("isIOSDevice()");
    expect(tourWindow).toContain("getInstallPrompt()");
    expect(tourWindow).toContain("ensureInstallPromptListener()");
    // The row sits inside the not-finale footer block.
    const footer = tourWindow.slice(tourWindow.indexOf("{!isFinale && ("));
    expect(footer).toContain("Get the app");
  });

  it("opens the Add to Home Screen guide on iOS, with the exact steps", () => {
    expect(tourWindow).toContain("Add to Home Screen");
    expect(tourWindow).toContain("1. Tap the Share button in Safari.");
    expect(tourWindow).toContain("2. Tap Add to Home Screen.");
    expect(tourWindow).toContain("3. Tap Add. Pulse Find opens straight to your tracker.");
    expect(tourWindow).toContain('if (installMode === "ios")');
  });

  it("never auto-fires the install prompt: exactly one call site, on tap", () => {
    expect(tourWindow.match(/promptInstall\(\)/g)).toHaveLength(1);
    const onGetApp = tourWindow.slice(tourWindow.indexOf("const onGetApp"));
    expect(onGetApp).toContain("await promptInstall();");
  });
});

describe("the old tour is fully gone", () => {
  it("deletes the old lib, component, and test", () => {
    expect(existsSync(join(root, "lib", "guided-tour.ts"))).toBe(false);
    expect(existsSync(join(root, "components", "GuidedTour.tsx"))).toBe(false);
    expect(existsSync(join(root, "lib", "__tests__", "guided-tour.test.ts"))).toBe(false);
    expect(existsSync(join(root, "lib", "__tests__", "demo-nav-tour-param.test.ts"))).toBe(false);
  });

  it("removes every ?tour= from the plumbing", () => {
    for (const rel of [
      "app/demo/DemoNav.tsx",
      "app/demo/DemoDashboard.tsx",
      "app/demo/page.tsx",
      "app/demo/sheet/page.tsx",
      "app/demo/leads/page.tsx",
      "app/demo/networking/page.tsx",
      "app/demo/connect/page.tsx",
      "app/jobs/page.tsx",
      "app/page.tsx",
      "components/FloatingPulseButton.tsx",
    ]) {
      expect(read(rel)).not.toContain("?tour=");
    }
  });

  it("leaves no import of the old lib anywhere in non-test source", () => {
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "__tests__") out.push(...walk(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          out.push(full);
        }
      }
      return out;
    };
    for (const file of walk(root)) {
      expect(readFileSync(file, "utf8")).not.toContain("lib/guided-tour");
    }
  });

  it("mounts the tour window in the layout instead of the old coach", () => {
    expect(layout).toContain('from "@/components/TourWindow"');
    expect(layout).toContain("<TourWindow />");
    expect(layout).not.toContain("GuidedTour");
  });
});

describe("the landing is the About page now, not the old hero", () => {
  it("keeps the top nav, drops the old hero, and carries no tour param", () => {
    // Nov 19 2026: the old landing (hero, capabilities, video, Bento,
    // job finder, MCP section, StatsBand) was replaced by the About
    // page + Get the app section. The nav stays; the hero is gone.
    expect(home).toContain('href="/jobs"');
    expect(home).toContain('href="/demo"');
    expect(home).toContain('href="/demo/connect"');
    expect(home).toContain("<InstallSection />");
    expect(home).toContain("<AboutLanding />");
    expect(home).toContain("<SiteFooter />");
    expect(home).not.toContain("Know what&apos;s waiting");
    expect(home).not.toContain("HERO_CAPABILITIES");
    expect(home).not.toContain("demo-tour.mp4");
    expect(home).not.toContain("?tour=");
    expect(home).not.toContain("revalidate");
  });

  it("redirects a signed-in visitor to /app, server-side", () => {
    expect(home).toContain('from "@/lib/supabase/server"');
    expect(home).toContain("supabase.auth.getUser()");
    expect(home).toContain('redirect("/app")');
  });
});

describe("the dashboard is untouched", () => {
  it("no dashboard file carries tour or install wiring", () => {
    for (const rel of [
      "components/dashboard/Dashboard.tsx",
      "components/dashboard/Overview.tsx",
      "components/dashboard/SheetView.tsx",
      "components/pipeline/LeadsSection.tsx",
      "components/pipeline/NetworkingSection.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toContain("tour-window");
      expect(src).not.toContain("TourWindow");
      expect(src).not.toContain("install-prompt");
      expect(src).not.toContain("Get the app");
      expect(src).not.toContain("pulsefind:tour-open");
    }
  });
});

describe("the new window styles", () => {
  it("replaces the old tour CSS with the window animations", () => {
    for (const name of [
      "pf-tour-winpop",
      "pf-tour-bob",
      "pf-tour-crystal-glow",
      "pf-tour-sparkfly",
      "pf-tour-swapin",
      "pf-tour-wiggle",
      "pf-tour-xpulse",
      "pf-tour-ecgdraw",
      "pf-tour-stagepop",
      "pf-tour-badgepop",
      "pf-tour-fall",
      "pf-tour-nextglow",
    ]) {
      expect(css).toContain(name);
    }
    for (const old of [
      ".tour-ring {",
      ".tour-card {",
      ".tour-crystal {",
      ".tour-bubble {",
      ".tour-badge {",
      ".tour-progress-ring-fill",
    ]) {
      expect(css).not.toContain(old);
    }
  });

  it("covers the new animations under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    // The tour block sits before the file's last reduced-motion block
    // (the site floats), so take the tour block's own instead.
    const tourReduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("pf-tour-window")));
    expect(tourReduced).toContain(".pf-tour-winpop { animation: none; }");
    expect(tourReduced).toContain(".pf-tour-bob { animation: none; }");
    expect(tourReduced).toContain(".pf-tour-confetti i { animation: none; }");
    expect(tourReduced).toContain(".pf-tour-next-glow { animation: none; }");
    expect(reduced).toContain(".pf-site-float-a");
  });
});

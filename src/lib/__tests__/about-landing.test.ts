import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldAutoStartTour, TOUR_CONNECT_HREF } from "@/lib/tour-window";

// The About landing (Nov 19 2026): the old hero landing is replaced
// by the About page with the Get the app section above it. Signed-out
// visitors meet the tour first, then this page; signed-in visitors
// redirect to /app server-side. The founder photo is Kumail's real
// headshot (public/founder/kumail-rizvi.webp), not the monogram
// placeholder and never the old 150x150 silhouette.
//
// EXPECTED_TEST_COUNT is the true automated-test count from the final
// `npm test` run on the deploy base — it must match the TEST_COUNT
// constant in AboutLanding.tsx, which renders it in the rigor
// paragraph, the "N tests · CI" chip, and the founder number.

const EXPECTED_TEST_COUNT = 879;

const root = join(__dirname, "..", "..");
const repoRoot = join(root, "..");
const read = (rel: string): string => readFileSync(join(root, ...rel.split("/")), "utf8");

const home = read("app/page.tsx");
const about = read("components/landing/AboutLanding.tsx");
const install = read("components/landing/InstallSection.tsx");
const replay = read("components/landing/ReplayTourButton.tsx");
const tourWindow = read("components/TourWindow.tsx");
const css = read("app/globals.css");

describe("page order: install first, then About", () => {
  it("keeps the site chrome and renders Get the app above the About page", () => {
    expect(home).toContain("<TopBar");
    expect(home).toContain("<InstallSection />");
    expect(home).toContain("<AboutLanding />");
    expect(home).toContain("<SiteFooter />");
    expect(home.indexOf("<TopBar")).toBeLessThan(home.indexOf("<InstallSection />"));
    expect(home.indexOf("<InstallSection />")).toBeLessThan(home.indexOf("<AboutLanding />"));
    expect(home.indexOf("<AboutLanding />")).toBeLessThan(home.indexOf("<SiteFooter />"));
    expect(install).toContain('id="getApp"');
    expect(about).toContain('id="aboutPage"');
  });

  it("has no lock veil: the About page is simply the page underneath", () => {
    expect(home).not.toContain("lock-veil");
    expect(home).not.toContain("lockVeil");
    expect(about).not.toContain("lock-veil");
    expect(about).not.toContain("unlocks after the tour");
  });
});

describe("signed-in visitors go straight to /app", () => {
  it("redirects server-side with the Supabase server client", () => {
    expect(home).toContain('import { createClient } from "@/lib/supabase/server";');
    expect(home).toContain("await createClient()");
    expect(home).toContain("supabase.auth.getUser()");
    expect(home).toContain('if (data.user) redirect("/app");');
    expect(home).toContain('import { redirect } from "next/navigation";');
    // force-dynamic: the redirect must run on every request. Without
    // it the env guard lets the page prerender static at build time
    // and the session check never runs in production.
    expect(home).toContain('export const dynamic = "force-dynamic";');
  });

  it("skips the check when Supabase is not configured, instead of throwing", () => {
    expect(home).toContain("if (env.supabaseUrl && env.supabaseKey) {");
  });
});

describe("the founder section", () => {
  it("tells the bio and the stack, verbatim from the approved preview", () => {
    expect(about).toContain("Kumail Rizvi");
    expect(about).toContain("Founder · Builder");
    expect(about).toContain("computer science senior at UW Bothell");
    expect(about).toContain("graduating December 2027");
    expect(about).toContain("hundreds of applications");
    expect(about).toContain("Next.js 16 and React 19");
    expect(about).toContain("Postgres");
    expect(about).toContain("MCP server");
    expect(about).toContain("Claude Code");
    expect(about).toContain("Agensi");
    expect(about).toContain("#1 for");
    expect(about).toContain("out of 18 listings");
  });

  it("links the founder's real profiles", () => {
    expect(about).toContain("https://www.linkedin.com/in/syedkumailrizvi");
    expect(about).toContain("https://github.com/kumailrizvi890");
    expect(about).toContain("https://portfolio-kumailr.vercel.app");
  });

  it("carries the true test count in all three places, from one constant", () => {
    expect(about).toContain(`const TEST_COUNT = ${EXPECTED_TEST_COUNT};`);
    expect(about).toContain("{TEST_COUNT} automated tests, green in CI on every push");
    expect(about).toContain("{TEST_COUNT} tests · CI");
    expect(about).toContain("<b>{TEST_COUNT}</b>");
    expect(about).not.toContain("880 automated tests");
  });

  it("keeps the approved founder-number snapshots", () => {
    expect(about).toContain("<b>243</b>");
    expect(about).toContain("Applications tracked in Pulse Find");
    expect(about).toContain("<b>6</b>");
    expect(about).toContain("Live projects shipped");
    expect(about).toContain("<b>#1 of 18</b>");
  });

  it("states the rigor only as verified against the repo", () => {
    // Softened from the preview: no test covers the refresh-jobs or
    // sync-trigger Edge Functions, the sha-verification of the
    // two-hour sync lives in the external cron script (not this repo),
    // the jobs table is publicly readable by design, and Vercel has
    // gone Ready on a red CI run before (pass 56).
    expect(about).toContain("integration tests against the Supabase sync engine");
    expect(about).toContain("end-to-end coverage of the MCP server tools");
    expect(about).toContain("over the real MCP");
    expect(about).toContain("two-hour tracker sync records every run");
    expect(about).toContain("locks your tracker, leads, and contacts to your account");
    expect(about).toContain("Excel export is round-trip checked");
    expect(about).toContain("push runs the full suite in CI");
    expect(about).toContain("red run gets fixed before");
    expect(about).toContain("anything else ships");
    expect(about).not.toContain("sha-verified");
    expect(about).not.toContain("locks every table to its owner");
    expect(about).not.toContain("if a test goes red, the deploy doesn't happen");
    expect(about).not.toContain("Edge Functions, and end-to-end");
  });

  it("has no Ask Kumail paragraph anywhere on the landing", () => {
    for (const src of [home, about, install]) {
      expect(src).not.toContain("Ask Kumail");
    }
  });
});

describe("the founder photo is the real headshot", () => {
  it("renders the optimized headshot with the right alt text", () => {
    expect(about).toContain('src="/founder/kumail-rizvi.webp"');
    expect(about).toContain('alt="Kumail Rizvi, founder of Pulse Find"');
    expect(about).toContain("width={600}");
    expect(about).toContain("height={534}");
  });

  it("ships the file under public/founder, web-sized", () => {
    const p = join(repoRoot, "public", "founder", "kumail-rizvi.webp");
    expect(existsSync(p)).toBe(true);
    const size = statSync(p).size;
    expect(size).toBeGreaterThan(1000);
    expect(size).toBeLessThan(200 * 1024);
    const head = readFileSync(p).subarray(0, 12).toString("latin1");
    expect(head.startsWith("RIFF")).toBe(true);
    expect(head.includes("WEBP")).toBe(true);
  });

  it("never uses the monogram placeholder or the old silhouette", () => {
    for (const src of [home, about, install]) {
      expect(src).not.toContain("photo-mono");
      expect(src).not.toContain("Monogram portrait placeholder");
      expect(src).not.toContain("user-profile-reference");
    }
    expect(css).not.toContain(".photo-mono");
    expect(css).not.toContain(".mono-crystal");
  });
});

describe("the install section, minus the two removals", () => {
  it("has no 'Real app · No app store needed' badge", () => {
    expect(install).not.toContain("Real app");
    expect(install).not.toContain("No app store needed");
    expect(install).not.toContain("install-badge");
    expect(css).not.toContain(".install-badge");
  });

  it("has no 'Step one: Open Pulse Find' — each guide is 3 steps", () => {
    expect(install).not.toContain("Open Pulse Find in");
    // iPhone: Share → Add to Home Screen → Done.
    expect(install).toContain("Tap the");
    expect(install).toContain("Share");
    expect(install).toContain("Add to Home Screen");
    // Android: Install app → Install → Done.
    expect(install).toContain("Install app");
    expect(install).toContain("Tap");
    expect(install).toContain("Install");
    // The status line stays accurate: 3 taps in Safari.
    expect(install).toContain("On iPhone it&apos;s 3 taps in Safari:");
  });

  it("keeps the dashboard-unchanged note and the perks", () => {
    expect(install).toContain("The dashboard itself doesn&apos;t change.");
    expect(install).toContain("that exact dashboard");
    expect(install).toContain("Opens straight to /app");
    expect(install).toContain("Full-screen, no browser chrome");
    expect(install).toContain("Same login, same data");
    expect(install).toContain("Nothing to update — always latest");
  });

  it("wires the shared install-prompt capture, never auto-firing", () => {
    expect(install).toContain('from "@/lib/install-prompt"');
    expect(install).toContain("ensureInstallPromptListener()");
    expect(install).toContain("promptInstall()");
    expect(install).toContain("isIOSDevice()");
    expect(install).toContain("isStandaloneMode()");
    expect(install).toContain("getInstallPrompt()");
    expect(install).toContain("subscribeInstallPrompt(sync)");
    expect(install).not.toContain('addEventListener("beforeinstallprompt"');
    expect(install).toContain("Add Pulse Find to my phone");
    expect(install).toContain("On your home screen ✓");
  });

  it("shows the iOS Add to Home Screen guidance with the exact steps", () => {
    expect(install).toContain("Add to Home Screen — show me how");
    expect(install).toContain("Share → Add to Home");
    expect(install).toContain("Screen → Add");
  });

  it("uses the repo's real app icon in the phone mock", () => {
    expect(install).toContain('src="/icons/icon-512.png"');
    expect(install).not.toContain("pulse-icon-512");
    expect(install).toContain("Tap");
    expect(install).toContain("Pulse Find");
    expect(install).toContain("That&apos;s the one step.");
  });
});

describe("the About foot", () => {
  it("points up to Get the app and offers a replay + Connect", () => {
    expect(about).toContain('href="#getApp"');
    expect(about).toContain("Get the app ↑");
    expect(about).toContain("That&apos;s the whole site.");
    expect(about).toContain("<ReplayTourButton />");
    expect(replay).toContain("Replay the tour");
    expect(replay).toContain("OPEN_TOUR_EVENT");
    // Kept as-is from the preview (open question: should this go to
    // /signup like the tour finale?).
    expect(about).toContain("https://pulsefind-app.vercel.app/demo/connect");
  });
});

describe("the tour gating is unchanged", () => {
  it("still auto-starts only for signed-out first-timers on /", () => {
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/" })).toBe(true);
    expect(shouldAutoStartTour({ signedIn: true, completed: false, pathname: "/" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: true, pathname: "/" })).toBe(false);
    expect(shouldAutoStartTour({ signedIn: false, completed: false, pathname: "/demo" })).toBe(false);
  });

  it("still ends on Connect to /signup, with muted disabled buttons", () => {
    expect(TOUR_CONNECT_HREF).toBe("/signup");
    expect(tourWindow).toContain("href={TOUR_CONNECT_HREF}");
    expect(tourWindow).toContain("disabled:opacity-40");
    expect(tourWindow).toContain("disabled:opacity-35");
  });
});

describe("the landing touches no dashboard code", () => {
  it("the new components import nothing from the dashboard", () => {
    for (const src of [home, about, install, replay]) {
      expect(src).not.toContain("components/dashboard");
      expect(src).not.toContain("TourWindow");
    }
    expect(home).not.toContain("Dashboard");
  });
});

describe("the new landing styles", () => {
  it("ports the install + About CSS, without the removed pieces", () => {
    for (const name of [
      ".install-card",
      ".btn-install",
      ".p-step",
      ".phone-screen",
      ".app-ic.pulse .ic",
      ".about-kicker",
      ".feat-list",
      ".founder-grid",
      ".photo-ring",
      ".stack-chips",
      ".founder-nums",
      ".about-foot",
      ".cta2",
    ]) {
      expect(css).toContain(name);
    }
    expect(css).toContain("@keyframes pf-about-iconpulse");
    expect(css).toContain(".photo-ring img");
    expect(css).toContain("object-fit: cover");
  });

  it("covers the phone icon pulse under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain(".pf-site-float-a");
    const pin = css.indexOf(".app-ic.pulse .ic { animation: none; }");
    expect(pin).toBeGreaterThan(0);
    const mediaStart = css.lastIndexOf("@media (prefers-reduced-motion: reduce)", pin);
    expect(mediaStart).toBeGreaterThan(0);
    expect(css.slice(mediaStart, pin)).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

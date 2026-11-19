import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pulse as a floating assistant: one red 3D crystal, bottom-right, on
// every page. It opens the SAME Ask Pulse general chat the dashboard
// header button opens (same TaskChatPanel, same engine), through window
// events when a Dashboard is mounted and through ?chat=1 navigation
// when there is none. The chat panel itself only gained depth: layered
// shadows, a glowing edge, a 3D crystal avatar, bubbles with lift, a
// floating composer bar. Its sizing behavior from the chat-gap fix is
// pinned here too, so the depth cannot bring the void back.

const root = join(__dirname, "..", "..");
const button = readFileSync(join(root, "components", "FloatingPulseButton.tsx"), "utf8");
const layout = readFileSync(join(root, "app", "layout.tsx"), "utf8");
const dashboard = readFileSync(join(root, "components", "dashboard", "Dashboard.tsx"), "utf8");
const panel = readFileSync(join(root, "components", "dashboard", "TaskChatPanel.tsx"), "utf8");
const brand = readFileSync(join(root, "components", "PulseBrand.tsx"), "utf8");
const accountDashboard = readFileSync(join(root, "app", "app", "AccountDashboard.tsx"), "utf8");
const appPage = readFileSync(join(root, "app", "app", "page.tsx"), "utf8");

describe("floating Pulse button", () => {
  it("is a real button with a chat label, fixed bottom-right above the page", () => {
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-label={open ? "Close chat" : "Chat with Pulse"}');
    expect(button).toContain("fixed bottom-5");
    expect(button).toContain("right-5");
    expect(button).toContain("z-[60]");
    expect(button).toContain("focus-visible:outline-accent");
  });

  it("shows the shared 3D crystal, not a flat dot", () => {
    expect(button).toContain('from "@/components/PulseBrand"');
    expect(button).toContain("<PulseCrystal");
    expect(button).toContain("pf-assistant-float");
    expect(button).toContain("pf-assistant-glow");
    expect(button).toContain("perspective(600px)");
    expect(button).toContain("rotateX(");
    expect(button).toContain("rotateY(");
  });

  it("uses CSS 3D only, no WebGL runtime for a 56px button", () => {
    expect(button).not.toContain("react-three");
    expect(button).not.toContain("@react-three");
    expect(button).not.toContain("three");
    expect(button).not.toContain("Canvas");
  });

  it("opens the same chat through window events, with a navigation fallback", () => {
    expect(button).toContain('new CustomEvent("pulsefind:assistant-open")');
    expect(button).toContain('new CustomEvent("pulsefind:assistant-close")');
    expect(button).toContain('"pulsefind:assistant-state"');
    expect(button).toContain('"/app?chat=1"');
    expect(button).toContain('"/demo?chat=1"');
    expect(button).toContain("pathname.startsWith(\"/app\")");
  });

  it("becomes a close control docked left of the panel while the chat is open", () => {
    expect(button).toContain('aria-expanded={open}');
    expect(button).toContain("<IconX");
    expect(button).toContain("right-[432px]");
    expect(button).toContain("max-lg:hidden");
  });

  it("hides while the tour window is open, on auth pages, and while a drawer owns the corner", () => {
    expect(button).toContain("TOUR_OPEN_EVENT");
    expect(button).toContain("TOUR_CLOSE_EVENT");
    expect(button).toContain("if (tourOpen");
    expect(button).toContain('"/login"');
    expect(button).toContain('"/signup"');
    expect(button).toContain('"/forgot-password"');
    expect(button).toContain("if ((overlayOpen || dialogOpen) && !open) return null;");
  });

  it("reuses the waiting count for its badge instead of inventing a data path", () => {
    expect(button).toContain("pf-bell-count");
    expect(button).toContain("detail.waiting");
    expect(button).toContain('new CustomEvent("pulsefind:assistant-ping")');
  });

  it("respects reduced motion in both the tilt and the CSS", () => {
    expect(button).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(button).toContain("@media (prefers-reduced-motion: reduce)");
    expect(button).toContain("transition: none");
  });

  it("moves on the design easing, under 300ms", () => {
    expect(button).toContain("0.25s cubic-bezier(0.22, 1, 0.36, 1)");
  });

  it("has no em dashes in its copy", () => {
    expect(button).not.toContain("—");
  });
});

describe("floating button wiring", () => {
  it("is rendered from the root layout, inside Suspense like the tour", () => {
    expect(layout).toContain('from "@/components/FloatingPulseButton"');
    expect(layout).toContain("<FloatingPulseButton />");
  });

  it("Dashboard answers the button with chat state and opens on its events", () => {
    expect(dashboard).toContain('"pulsefind:assistant-open"');
    expect(dashboard).toContain('"pulsefind:assistant-close"');
    expect(dashboard).toContain('"pulsefind:assistant-state"');
    expect(dashboard).toContain("open: generalChatOpen");
    expect(dashboard).toContain("pending: generalChatPending");
    expect(dashboard).toContain("overlayOpen: drawer.open || chatOpen");
    expect(dashboard).toContain("waiting: queue.length");
    expect(dashboard).toContain("openGeneralChatPanel()");
    expect(dashboard).toContain('"pulsefind:assistant-ping"');
  });

  it("the signed-in tracker supports ?chat=1 like the demo does", () => {
    expect(appPage).toContain('sp.chat === "1"');
    expect(appPage).toContain("openChat={");
    expect(accountDashboard).toContain("openChat?: boolean");
    expect(accountDashboard).toContain("openGeneralChat={openChat}");
    expect(accountDashboard).toContain('router.replace("/app"');
  });
});

describe("floating button hides under foreign modal dialogs", () => {
  const leads = readFileSync(join(root, "components", "pipeline", "LeadsSection.tsx"), "utf8");
  const networking = readFileSync(join(root, "components", "pipeline", "NetworkingSection.tsx"), "utf8");
  const importDialog = readFileSync(join(root, "components", "dashboard", "ImportDialog.tsx"), "utf8");
  const settings = dashboard;

  it("watches the DOM for modal dialogs with a MutationObserver and an initial scan", () => {
    expect(button).toContain("new MutationObserver(scan)");
    expect(button).toContain("observer.observe(document.body, { childList: true, subtree: true })");
    expect(button).toContain("observer.disconnect()");
    expect(button).toContain("setDialogOpen(foreign)");
    expect(button).toContain("const [dialogOpen, setDialogOpen] = useState(false);");
  });

  it("matches every modal dialog by role and aria-modal, including the lead form", () => {
    expect(button).toContain("'[role=\"dialog\"][aria-modal=\"true\"]'");
    expect(leads).toContain('role="dialog" aria-modal="true"');
    expect(leads).toContain("Save lead");
    expect(networking).toContain('role="dialog" aria-modal="true"');
    expect(importDialog).toContain('role="dialog" aria-modal="true"');
    expect(settings).toContain('role="dialog" aria-modal="true"');
  });

  it("does not hide for the chat panel itself, which carries pf-chat-panel-3d", () => {
    expect(button).toContain('!el.closest(".pf-chat-panel-3d")');
    expect(panel).toContain("pf-chat-panel-3d");
    expect(panel).toContain('role="dialog"');
    expect(panel).toContain('aria-modal="true"');
  });

  it("treats the foreign dialogs as foreign: none of them carries the panel class", () => {
    expect(leads).not.toContain("pf-chat-panel-3d");
    expect(networking).not.toContain("pf-chat-panel-3d");
    expect(importDialog).not.toContain("pf-chat-panel-3d");
    expect(settings).not.toContain("pf-chat-panel-3d");
  });

  it("hides while a foreign dialog is open but stays as the chat close control", () => {
    expect(button).toContain("if ((overlayOpen || dialogOpen) && !open) return null;");
    expect(button).toContain('aria-label={open ? "Close chat" : "Chat with Pulse"}');
  });
});

describe("3D chat panel restyle", () => {
  it("shares one crystal mark from PulseBrand", () => {
    expect(brand).toContain("export function PulseCrystal");
    expect(panel).toContain('import { PulseCrystal, PulseDot } from "@/components/PulseBrand"');
    expect(panel).not.toContain("export function PulseCrystal");
  });

  it("gives the panel layered depth without touching its layout", () => {
    expect(panel).toContain("pf-chat-panel-3d");
    expect(panel).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.09)");
    expect(panel).toContain("0 24px 64px -16px rgba(0, 0, 0, 0.85)");
    expect(panel).toContain("0 0 48px -12px rgba(248, 52, 62, 0.45)");
  });

  it("gives the crystal avatar a halo and the bubbles depth", () => {
    expect(panel).toContain("pf-crystal-halo");
    expect(panel).toContain("radial-gradient(circle, rgba(248, 52, 62, 0.38)");
    expect(panel).toContain("pf-chat-bubble-user-3d");
    expect(panel).toContain("pf-chat-bubble-ai-3d");
    expect(panel).toContain("linear-gradient(160deg, #fb7185, #f43f5e 55%, #e11d48)");
  });

  it("makes the composer a floating bar that lifts on focus", () => {
    expect(panel).toContain("pf-chat-composer-3d");
    expect(panel).toContain(".pf-chat-composer-3d:focus-within");
    expect(panel).toContain("translateY(-1px)");
  });

  it("keeps the chat-gap sizing: content-sized, capped, internally scrolling", () => {
    expect(panel).toContain("max-h-[92dvh]");
    expect(panel).toContain("lg:max-h-[calc(100dvh-32px)]");
    expect(panel).toContain("min-h-0 flex-auto");
    expect(panel).toContain("overflow-y-auto");
  });

  it("keeps general mode, task mode, suggestions, and Talk to Agent", () => {
    expect(panel).toContain("GENERAL_CHAT_SUGGESTIONS");
    expect(panel).toContain("TASK_CHAT_SUGGESTIONS");
    expect(panel).toContain("Talk to Agent");
    expect(panel).toContain('aria-label="Close chat"');
  });

  it("collapses the new motion under reduced motion", () => {
    expect(panel).toContain(".pf-chat-composer-3d { transition: none; }");
  });
});

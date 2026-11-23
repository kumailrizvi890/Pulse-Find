import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The task chat used to be a full-viewport-height panel (fixed inset-0,
// lg:inset-y-0) with the message list as flex-1, so with only the greeting
// and the suggestion chips the list stretched into a giant empty void and
// the Talk to Agent button and the input sat stranded at the very bottom.
// The panel is now a bottom-anchored dock on desktop and a bottom sheet
// on phones, sized to its content. Pin the anchoring and the list sizing
// so the void cannot come back silently.
const src = readFileSync(
  join(__dirname, "..", "..", "components", "dashboard", "TaskChatPanel.tsx"),
  "utf8",
);

function rootClasses(): string {
  // The shared dock classes are one literal inside cx(...); the right
  // offset is a conditional segment (lg:right-4 in general mode,
  // lg:right-[476px] beside the drawer in task mode).
  const m = src.match(/"pf-chat-in fixed[^"]*"/);
  if (!m) throw new Error("no chat panel root classes found in TaskChatPanel.tsx");
  return m[0];
}

function messageListClasses(): string {
  const m = src.match(/ref=\{listRef\} className="([^"]*)"/);
  if (!m) throw new Error("no message list div found in TaskChatPanel.tsx");
  return m[1];
}

function backdropClasses(): string {
  // The backdrop is cx("fixed inset-0 z-40", isGeneral ? ... : ...):
  // the base literal plus the conditional offset segment.
  const m = src.match(/aria-label="Close chat"[\s\S]{0,200}?className=\{cx\(([^)]*)\)\}/);
  if (!m) throw new Error("no chat backdrop button found in TaskChatPanel.tsx");
  return m[1];
}

describe("task chat panel sizing", () => {
  it("is bottom-anchored, not full viewport height", () => {
    const root = rootClasses();
    expect(root).toContain("bottom-0");
    expect(root).toContain("lg:bottom-4");
    expect(root).not.toContain("inset-0");
    expect(root).not.toContain("inset-y-0");
  });

  it("is capped in height on phones and on desktop", () => {
    const root = rootClasses();
    expect(root).toContain("max-h-[60dvh]");
    expect(root).toContain("lg:max-h-[calc(100dvh-32px)]");
  });

  it("sizes the message list to its content, then scrolls inside it", () => {
    const list = messageListClasses();
    // flex-auto (basis auto) lets the list hug its content while the chat
    // is short; flex-1 (basis 0) would collapse or stretch it. min-h-0
    // lets it shrink and scroll once the panel hits its height cap.
    expect(list).toContain("flex-auto");
    expect(list).toContain("min-h-0");
    expect(list).toContain("overflow-y-auto");
    expect(list).not.toContain("flex-1");
  });

  it("still opens the Talk to Agent handoff with its copy action", () => {
    expect(src).toContain("Talk to Agent");
    expect(src).toContain("setHandoffOpen(true)");
    expect(src).toContain("Copy for my agent");
    // Demo visitors go to /demo/connect, signed-in users to /app/connect
    // (demo-connect package). The link must split on userId, not hardcode.
    expect(src).toContain('userId ? "/app/connect" : "/demo/connect"');
  });

  it("keeps the greeting, suggestions, thinking state and due line", () => {
    expect(src).toContain("taskChatGreeting");
    expect(src).toContain("TASK_CHAT_SUGGESTIONS");
    expect(src).toContain("Thinking it over");
    expect(src).toContain("application?.action_due");
    expect(src).toContain("Ask about this task");
  });

  it("animates the panel entrance on the design easing and respects reduced motion", () => {
    expect(src).toContain("pf-chat-in");
    expect(src).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(src).toContain("prefers-reduced-motion");
    // The composer is focused on mount so the visitor can type straight
    // away, but a plain focus() scrolls the document on iOS Safari and
    // sent the dashboard to the bottom when the chat opened from the
    // landing page. The focus must never move the page: the navigation
    // already lands at the top.
    expect(src).toContain("inputRef.current?.focus({ preventScroll: true })");
    expect(src).not.toMatch(/inputRef\.current\?\.focus\(\)/);
  });
});

describe("task chat outside-click to close", () => {
  it("has a backdrop button that closes the chat", () => {
    expect(src).toContain('aria-label="Close chat"');
    expect(src).toContain("onClick={onClose}");
  });

  it("covers the screen on phones but stops at the panel on desktop, so it never swallows drawer clicks", () => {
    const backdrop = backdropClasses();
    expect(backdrop).toContain("fixed inset-0");
    // Task mode: the panel sits at right-[476px] and is 400px wide, so
    // its left edge is 876px from the viewport's right edge. General
    // mode has no drawer: the panel docks at right-4, so its left edge
    // is 432px from the right. The backdrop ends exactly there on
    // desktop in each mode: the free strip left of the panel is
    // clickable, the panel (and the drawer, in task mode) is not covered.
    expect(backdrop).toContain('isGeneral ? "lg:right-[432px]" : "lg:right-[876px]"');
  });

  it("sits below the panel in stacking order", () => {
    expect(backdropClasses()).toContain("z-40");
    expect(rootClasses()).toContain("z-50");
  });

  it("stays transparent so it does not double-dim over the drawer's backdrop", () => {
    expect(backdropClasses()).not.toContain("bg-black");
  });
});

describe("task chat general mode docking", () => {
  it("docks beside the drawer in task mode and at the right edge in general mode", () => {
    expect(src).toContain('isGeneral ? "lg:right-4" : "lg:right-[476px]"');
  });

  it("still bottom-anchors and caps its height in both modes", () => {
    const root = rootClasses();
    expect(root).toContain("bottom-0");
    expect(root).toContain("lg:bottom-4");
    expect(root).toContain("max-h-[60dvh]");
    expect(root).toContain("lg:max-h-[calc(100dvh-32px)]");
  });
});

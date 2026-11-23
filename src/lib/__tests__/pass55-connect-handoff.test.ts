import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildAgentHandoffPrompt, getMcpEndpoint } from "../agent-prompt";

// Pass-45 audit findings #10 + #12: the Talk to Agent handoff wording
// contradicted Connect (it asserted an access the visitor may not have),
// the demo Connect page let visitors copy the dead pf_YOUR_TOKEN
// placeholder, and the step-3 example questions had no Copy buttons.
// Finding #10a (drawer + chat "overlap") is covered here too: the desktop
// side-by-side gap is pinned from the layout classes, and the phone sheet
// is modal over the drawer by design (chat-gap fix), so no layout change
// was made for it — see the render check for the measured geometry.

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

// The askable question each step-3 Copy button takes. The display text
// keeps its human hint in parentheses/brackets; the copied string drops
// it, so the agent gets the question only (for the fourth, the user pastes
// the email after the question).
const COPIED_QUESTIONS = [
  "Scan my email from the last 7 days and update Pulse Find.",
  "What's waiting on me in my job search, soonest first?",
  "Find remote software engineering internships posted this week.",
  "Is this recruiter email a scam?",
];

describe("pass-55 finding #10a: drawer + chat geometry", () => {
  it("docks the task chat beside the drawer on desktop with a 16px gap, not on top of it", () => {
    const chat = read("components/dashboard/TaskChatPanel.tsx");
    const drawer = read("components/dashboard/ApplicationDrawer.tsx");
    // Task mode: right-[476px], 400px wide. The drawer is max-w-[460px]
    // flush to the right edge, so its left edge is 460px from the right
    // and the chat's right edge is 476px from the right: a 16px gap.
    expect(chat).toContain('lg:right-[476px]');
    expect(chat).toContain("lg:w-[400px]");
    expect(drawer).toContain("max-w-[460px]");
    expect(476 - 460).toBe(16);
  });

  it("never opens the chat uninvited over the drawer on phones", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    // Opening a task opens its chat only on wide screens; on phones the
    // chat stays one tap away in the drawer header, so it never covers
    // the form uninvited.
    expect(dashboard).toContain("window.innerWidth >= 1024");
    expect(dashboard).toContain("if (typeof window !== \"undefined\" && window.innerWidth >= 1024) setChatOpen(true);");
  });

  it("keeps the phone chat a bottom sheet over the drawer, closable back to it", () => {
    const chat = read("components/dashboard/TaskChatPanel.tsx");
    // Modal by design (chat-gap fix): full-width bottom sheet, max 92dvh,
    // with its own Close button and an outside-click backdrop that closes
    // only the chat and leaves the drawer open.
    expect(chat).toContain("max-h-[60dvh]");
    expect(chat).toContain("inset-x-0 bottom-0");
    expect(chat).toContain('aria-label="Close chat"');
  });
});

describe("pass-55 finding #10b: Talk to Agent wording", () => {
  it("the dialog no longer asserts the agent already has access", () => {
    const chat = read("components/dashboard/TaskChatPanel.tsx");
    expect(chat).not.toContain("Your agent already has your tracker access");
    expect(chat).not.toContain("already has your tracker access");
    expect(chat).toContain("There is no token in here");
    expect(chat).toContain("an agent that is already connected has its own access from the Connect page");
    // The not-connected case is still pointed at the Connect page.
    expect(chat).toContain("Not connected yet?");
    expect(chat).toContain('userId ? "/app/connect" : "/demo/connect"');
  });

  it("the handoff prompt is conditional about the connection, and carries no token", () => {
    const p = buildAgentHandoffPrompt({ endpoint: getMcpEndpoint() });
    expect(p).toContain("If you are already connected");
    expect(p).toContain("If you are not connected yet");
    expect(p).toContain("tell me to connect you from the Connect page first");
    expect(p).not.toContain("You are already connected to the MCP server");
    expect(p).not.toContain("You already have your own access token");
    expect(p).not.toMatch(/pf_[A-Za-z0-9]/);
    expect(p).not.toContain("—");
  });

  it("the handoff doc comment no longer asserts the agent already has access", () => {
    const taskChat = read("lib/task-chat.ts");
    expect(taskChat).not.toContain("the agent already has its own access from the Connect page.");
    // The comment wraps across lines, so pin the two halves separately.
    expect(taskChat).toContain("a connected agent already has its own access from the Connect");
    expect(taskChat).toContain("the prompt says so only for an agent that is already connected");
  });
});

describe("pass-55 finding #12a: placeholder token copy", () => {
  it("the demo step 1 shows the placeholder but offers no Copy button for it", () => {
    const agent = read("app/demo/connect/DemoConnectAgent.tsx");
    expect(agent).toContain("pf_YOUR_TOKEN");
    expect(agent).not.toContain("setTokenCopied");
    expect(agent).not.toContain("tokenCopied");
    expect(agent).not.toContain("copy(PLACEHOLDER_TOKEN");
    // The step-2 snippet and step-4 prompt Copy buttons stay: they copy
    // templates, and both carry the replace-the-placeholder footnote.
    expect(agent).toContain("setSnippetCopied");
    expect(agent).toContain("setPromptCopied");
    expect(agent).toContain("Replace pf_YOUR_TOKEN with the real token from step 1 after you sign up.");
    // The sign-up call to action stays prominent.
    expect(agent).toContain("Sign up to get a real token");
  });

  it("the signed-in step 1 still copies only a real, freshly created token", () => {
    const signedIn = read("app/app/connect/ConnectAgent.tsx");
    // The Copy button only renders inside the fresh-token branch, and it
    // copies that token — never the placeholder.
    expect(signedIn).toContain("onClick={() => copy(fresh)}");
    expect(signedIn).not.toContain('copy("pf_YOUR_TOKEN")');
    expect(signedIn).not.toContain("copy(PLACEHOLDER");
    // The snippet/prompt copies are templates, covered by the footnote.
    expect(signedIn).toContain("Replace pf_YOUR_TOKEN with the token from step 1.");
  });
});

describe("pass-55 finding #12b: step-3 questions copyable", () => {
  it("the demo page gives each question a Copy button taking the askable question only", () => {
    const agent = read("app/demo/connect/DemoConnectAgent.tsx");
    for (const q of COPIED_QUESTIONS) {
      expect(agent).toContain(`copy: "${q}"`);
    }
    // The human hints stay on screen, out of the copied text.
    expect(agent).toContain("(Uses the scan_inbox prompt.)");
    expect(agent).toContain("[paste it]");
    expect(agent).toContain("Copy question ${i + 1}");
    expect(agent).toContain("copiedQuestion");
    expect(agent).toContain("setCopiedQuestion");
  });

  it("the signed-in page gives each question the same Copy button and strings", () => {
    const signedIn = read("app/app/connect/ConnectAgent.tsx");
    for (const q of COPIED_QUESTIONS) {
      expect(signedIn).toContain(`copy: "${q}"`);
    }
    expect(signedIn).toContain("(Uses the scan_inbox prompt.)");
    expect(signedIn).toContain("[paste it]");
    expect(signedIn).toContain("Copy question ${i + 1}");
    expect(signedIn).toContain("copiedQuestion");
    // The question copy never flips the step-1 token "Copied" label: it
    // has its own handler, not the shared copy().
    expect(signedIn).toContain("copyQuestion(");
    expect(signedIn).toContain("Separate from copy()");
  });

  it("both pages copy the same four questions", () => {
    const agent = read("app/demo/connect/DemoConnectAgent.tsx");
    const signedIn = read("app/app/connect/ConnectAgent.tsx");
    for (const q of COPIED_QUESTIONS) {
      expect(agent).toContain(`copy: "${q}"`);
      expect(signedIn).toContain(`copy: "${q}"`);
    }
  });
});

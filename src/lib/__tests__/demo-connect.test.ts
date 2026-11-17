import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The demo used to be a dead end for connecting an agent: the demo
// Settings dialog linked to /app/connect, which redirects to /login, and
// the task chat's handoff view linked there too. The public /demo/connect
// page is the demo-safe route (placeholder token, no Supabase, no real
// token creation), and the two links must point at it for demo visitors
// while signed-in visitors keep /app/connect. Pin both splits so the
// dead end cannot come back silently.
//
// NOTE: TaskChatPanel.tsx is also edited by the chat-gap package (same
// deploy queue, landing first). These assertions read whatever is on
// disk, so they hold whichever order the two packages land in.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const DEMO_CONNECT_LINK = 'userId ? "/app/connect" : "/demo/connect"';

describe("demo connect page", () => {
  it("is a public page: no sign-in redirect, no Supabase, no user lookup", () => {
    const page = read("app/demo/connect/page.tsx");
    expect(page).not.toContain("redirect(");
    expect(page).not.toContain("getUser");
    expect(page).not.toContain("supabase");
    expect(page).toContain("DemoConnectAgent");
  });

  it("uses the placeholder token everywhere and never creates a real one", () => {
    const agent = read("app/demo/connect/DemoConnectAgent.tsx");
    expect(agent).toContain("pf_YOUR_TOKEN");
    expect(agent).toContain("buildAgentPrompt");
    expect(agent).not.toContain("api_tokens");
    expect(agent).not.toContain("createClient");
    expect(agent).not.toContain("supabase");
    expect(agent).not.toContain("newToken");
    expect(agent).not.toContain("token_hash");
    expect(agent).toContain("/signup");
  });

  it("is reachable from the demo navigation", () => {
    const nav = read("app/demo/DemoNav.tsx");
    expect(nav).toContain('href="/demo/connect"');
  });

  it("sends demo visitors from Settings to /demo/connect, signed-in users to /app/connect", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain(DEMO_CONNECT_LINK);
    // The setup link splits the same way: demo visitors go to
    // /demo/connect (the wizard's agent steps, demo-safe) instead of
    // /app/setup, which redirects signed-out visitors to /login.
    expect(dashboard).toContain('userId ? "/app/setup" : "/demo/connect"');
    expect(dashboard).not.toContain('href="/app/setup"');
  });

  it("sends demo visitors from the task chat handoff to /demo/connect, signed-in users to /app/connect", () => {
    const chat = read("components/dashboard/TaskChatPanel.tsx");
    expect(chat).toContain(DEMO_CONNECT_LINK);
  });

  it("keeps the copy buttons above the code blocks, never overlaid on them", () => {
    const agent = read("app/demo/connect/DemoConnectAgent.tsx");
    // The overlaid version (absolute button over the <pre>) covered the
    // end of the step-2 snippet on narrow screens and covered prompt
    // text in step 4, worse once the prompt block was scrolled. Both
    // buttons now sit in a row above their block, in normal flow.
    expect(agent).not.toContain("absolute");
    expect(agent.match(/flex justify-end/g)?.length).toBe(2);
    expect(agent).toContain("setSnippetCopied");
    expect(agent).toContain("setPromptCopied");
    expect(agent).toContain("Copy full prompt");
  });

  it("leaves the signed-in Connect page doing real tokens", () => {
    const signedIn = read("app/app/connect/ConnectAgent.tsx");
    expect(signedIn).toContain('db.from("api_tokens")');
    expect(signedIn).toContain("newToken()");
  });

  it("keeps the signed-in Connect page's copy buttons above the code blocks, never overlaid on them", () => {
    const signedIn = read("app/app/connect/ConnectAgent.tsx");
    // The signed-in page had the same overlaid pattern as the demo
    // page: the step-2 Copy button covered the end of the snippet on
    // narrow screens and "Copy full prompt" covered prompt text in
    // step 4, worse once the prompt block was scrolled. Both buttons
    // now sit in a row above their block, in normal flow. The step-1
    // token Copy button was never overlaid (it sits in a flex row
    // beside the token) and is untouched.
    expect(signedIn).not.toContain("absolute");
    expect(signedIn.match(/flex justify-end/g)?.length).toBe(2);
    expect(signedIn).toContain("Copy full prompt");
    expect(signedIn).toContain("setPromptCopied");
    // Snippet content is unchanged: the Claude Code command and its
    // continuation line are exactly as before.
    expect(signedIn).toContain("claude mcp add --transport http pulse-find");
    expect(signedIn).toContain('--header "Authorization: ${auth}"');
  });
});

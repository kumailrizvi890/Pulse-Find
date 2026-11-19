import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildAgentHandoffPrompt,
  buildAgentPrompt,
  buildAgentPromptTemplate,
  buildOperatorBody,
  getMcpEndpoint,
} from "../agent-prompt";

const TOOLS = [
  "get_summary",
  "list_applications",
  "add_application",
  "update_application",
  "process_job_email",
  "check_job_scam",
  "search_jobs",
  "list_leads",
  "add_lead",
  "update_lead",
  "list_contacts",
  "add_contact",
  "update_contact",
];
const PROMPTS = ["scan_inbox", "daily_digest", "find_leads"];

describe("agent prompt", () => {
  it("fills in the real endpoint and token", () => {
    const prompt = buildAgentPrompt({
      endpoint: "https://pulsefind-app.vercel.app/api/mcp",
      token: "pf_testtoken123",
    });
    expect(prompt).toContain("https://pulsefind-app.vercel.app/api/mcp");
    expect(prompt).toContain("Authorization: Bearer pf_testtoken123");
    expect(prompt).not.toContain("pf_YOUR_API_TOKEN");
  });

  it("names the agent's jobs and hard rules", () => {
    const prompt = buildAgentPrompt({
      endpoint: "https://pulsefind-app.vercel.app/api/mcp",
      token: "pf_x",
    });
    for (const phrase of [
      "read-only",
      "process_job_email",
      "get_summary",
      "list_applications",
      "add_application",
      "Ghosted",
      "Never send email",
      "never apply",
      "Check for scams",
      "Never mark one of my tasks complete",
    ]) {
      expect(prompt).toContain(phrase);
    }
  });

  it("template uses placeholders for the handout", () => {
    const prompt = buildAgentPromptTemplate();
    expect(prompt).toContain("https://pulsefind-app.vercel.app/api/mcp");
    expect(prompt).toContain("pf_YOUR_API_TOKEN");
  });

  it("builds the endpoint from the app origin", () => {
    expect(getMcpEndpoint("https://pulsefind-app.vercel.app/")).toBe(
      "https://pulsefind-app.vercel.app/api/mcp",
    );
    expect(getMcpEndpoint()).toBe("https://pulsefind-app.vercel.app/api/mcp");
  });
});

describe("full operator prompt", () => {
  it("lists every tool and prompt, opens with the automatic setup, and names what still needs the user", () => {
    const p = buildAgentPrompt({ endpoint: getMcpEndpoint(), token: "pf_x" });
    for (const t of TOOLS) expect(p).toContain(t);
    for (const pr of PROMPTS) expect(p).toContain(pr);
    expect(p).toContain("Set me up first, automatically");
    expect(p).toContain("Sheet view");
    expect(p).toContain("Gmail");
    expect(p).toContain("What still needs me");
    expect(p).toContain("You cannot import the file yourself");
    expect(p).toContain("Never send email on my behalf, never apply to a job");
    expect(p).not.toContain("—");
  });

  it("uses the 21-day ghosted threshold from settings, not 14", () => {
    const p = buildOperatorBody();
    expect(p).toContain("21 days");
    expect(p).not.toContain("14 days");
  });
});

describe("buildAgentHandoffPrompt", () => {
  it("is the full prompt for the handoff, with no token and no assumed connection", () => {
    const p = buildAgentHandoffPrompt({ endpoint: "https://pulsefind-app.vercel.app/api/mcp" });
    // The connection is conditional, not asserted: the person pasting this
    // may not have set their agent up yet.
    expect(p).toContain("Your connection to the MCP server");
    expect(p).toContain("If you are already connected");
    expect(p).toContain("If you are not connected yet");
    expect(p).not.toContain("You are already connected to the MCP server");
    expect(p).not.toContain("You already have your own access token");
    expect(p).toContain("Do not ask me for a token");
    expect(p).toContain("Set me up first, automatically");
    for (const t of TOOLS) expect(p).toContain(t);
    for (const pr of PROMPTS) expect(p).toContain(pr);
    expect(p).not.toMatch(/pf_[A-Za-z0-9]/);
    expect(p).not.toContain("—");
  });

  it("shares the same operator body as the connect prompt", () => {
    const handoff = buildAgentHandoffPrompt({ endpoint: getMcpEndpoint() });
    expect(handoff).toContain(buildOperatorBody());
    expect(buildAgentPrompt({ endpoint: getMcpEndpoint(), token: "pf_x" })).toContain(buildOperatorBody());
  });
});

describe("SKILL.md handout agreement", () => {
  it("the paste-ready prompt in SKILL.md matches the template the app generates", () => {
    const skill = readFileSync(join(__dirname, "..", "..", "..", "skills", "pulse-find", "SKILL.md"), "utf8");
    const block = skill.split("```text\n")[1]?.split("\n```")[0];
    expect(block).toBeDefined();
    expect(block?.trim()).toBe(buildAgentPromptTemplate().trim());
  });
});

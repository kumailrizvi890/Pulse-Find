import { describe, expect, it } from "vitest";

import {
  buildAgentPrompt,
  buildAgentPromptTemplate,
  getMcpEndpoint,
} from "../agent-prompt";

describe("agent prompt", () => {
  it("fills in the real endpoint and token", () => {
    const prompt = buildAgentPrompt({
      endpoint: "https://pulse-find-two.vercel.app/api/mcp",
      token: "pf_testtoken123",
    });
    expect(prompt).toContain("https://pulse-find-two.vercel.app/api/mcp");
    expect(prompt).toContain("Authorization: Bearer pf_testtoken123");
    expect(prompt).not.toContain("pf_YOUR_API_TOKEN");
  });

  it("names the agent's jobs and hard rules", () => {
    const prompt = buildAgentPrompt({
      endpoint: "https://pulse-find-two.vercel.app/api/mcp",
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
    expect(prompt).toContain("https://pulse-find-two.vercel.app/api/mcp");
    expect(prompt).toContain("pf_YOUR_API_TOKEN");
  });

  it("builds the endpoint from the app origin", () => {
    expect(getMcpEndpoint("https://pulse-find-two.vercel.app/")).toBe(
      "https://pulse-find-two.vercel.app/api/mcp",
    );
    expect(getMcpEndpoint()).toBe("https://pulse-find-two.vercel.app/api/mcp");
  });
});

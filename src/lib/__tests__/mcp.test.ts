import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleBody, type AppRow, type JobRow, type Store } from "../../../supabase/functions/_shared/mcp";

/** In-memory Store standing in for Supabase. */
function memoryStore(seed: Partial<AppRow>[] = []): Store & { apps: AppRow[]; events: { application_id: string; kind: string; source_ref: string | null }[] } {
  let n = 0;
  const blank = (): AppRow => ({
    id: `app-${++n}`, company: "", role: "", track: "Internship", status: "Applied", date_applied: null, last_contact: null,
    latest_update: "", action_needed: "", action_due: null, interviews_done: 0, oa_received: false, link: "", notes: "",
  });
  const apps: AppRow[] = seed.map((s) => ({ ...blank(), ...s }));
  const events: { application_id: string; kind: string; source_ref: string | null }[] = [];
  const jobs: JobRow[] = [
    { company: "Stripe", title: "Software Engineer Intern", location: "Seattle", remote: false, url: "https://stripe.com/jobs/1", track: "Internship", posted_at: "2026-11-01T00:00:00Z" },
  ];
  return {
    apps, events,
    async listApps() { return apps.map((a) => ({ ...a })); },
    async insertApp(f) { const a = { ...blank(), ...(f as Partial<AppRow>) }; apps.push(a); return { ...a }; },
    async updateApp(id, f) { const a = apps.find((x) => x.id === id); if (!a) return null; Object.assign(a, f); return { ...a }; },
    async addEvent(e) { if (e.source_ref && events.some((x) => x.source_ref === e.source_ref)) return false; events.push(e); return true; },
    async hasEvent(ref) { return events.some((x) => x.source_ref === ref); },
    async searchJobs(p) { return jobs.filter((j) => !p.query || `${j.title} ${j.company}`.toLowerCase().includes(p.query.toLowerCase())).slice(0, p.limit); },
    async ghostDays() { return 21; },
  };
}

const call = (store: Store, name: string, args: Record<string, unknown> = {}) =>
  handleBody({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, store) as Promise<{
    result: { isError: boolean; structuredContent: Record<string, unknown>; content: { text: string }[] };
  }>;

describe("MCP tools", () => {
  it("processes a stream of real-world emails into the tracker", async () => {
    const s = memoryStore([{ company: "Roblox", role: "Software Engineer, Early Career", status: "Applied", last_contact: "2026-09-30" }]);

    const r1 = await call(s, "process_job_email", {
      from: "Ramp Recruiting <no-reply@ramp.com>", subject: "Thanks for applying to Ramp",
      body: "We received your application for Software Engineer Intern.", date: "2026-11-01", message_id: "m1",
    });
    expect(r1.result.structuredContent.result).toBe("created");

    const r2 = await call(s, "process_job_email", {
      from: "Roblox <noreply@hackerrank.com>", subject: "Roblox: complete your HackerRank assessment",
      body: "Please complete the online assessment. The link expires in 7 days.", date: "2026-11-02", message_id: "m2",
    });
    expect(r2.result.structuredContent.result).toBe("updated");
    const roblox = s.apps.find((a) => a.company === "Roblox")!;
    expect(roblox).toMatchObject({ status: "OA Received", oa_received: true, action_due: "2026-11-09", last_contact: "2026-11-02" });

    // same email again is a no-op
    const dup = await call(s, "process_job_email", { from: "Roblox <noreply@hackerrank.com>", subject: "x", body: "y", message_id: "m2" });
    expect(dup.result.structuredContent.result).toBe("duplicate");

    const alert = await call(s, "process_job_email", { from: "LinkedIn <jobalerts-noreply@linkedin.com>", subject: "25 new jobs for you", body: "..." });
    expect(alert.result.structuredContent.result).toBe("skipped");

    const scam = await call(s, "process_job_email", {
      from: "Hiring Team <global.corp.hr@gmail.com>", subject: "You have been selected",
      body: "Our HR department at Global Corp Inc will interview you on Telegram. We will send you a check to purchase equipment.",
    });
    expect(scam.result.structuredContent.result).toBe("flagged_scam");
    expect(s.apps).toHaveLength(2); // the scam created nothing

    const summary = await call(s, "get_summary");
    expect(summary.result.structuredContent).toMatchObject({ total: 2 });
    expect((summary.result.structuredContent.waiting_on_you as { company: string }[])[0].company).toBe("Roblox");
  });

  it("validates input and explains mistakes to the model", async () => {
    const s = memoryStore();
    const bad = await call(s, "add_application", { company: "Acme", link: "javascript:alert(1)" });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/https/);
    const missing = await call(s, "update_application", { id: "nope", status: "Offer" });
    expect(missing.result.isError).toBe(true);
    const wrongEnum = await call(s, "add_application", { company: "Acme", status: "Hired!!" });
    expect(wrongEnum.result.content[0].text).toMatch(/must be one of/);
  });

  it("answers protocol basics and ignores notifications", async () => {
    const s = memoryStore();
    expect(await handleBody({ jsonrpc: "2.0", method: "notifications/initialized" }, s)).toBeNull();
    const unknown = (await handleBody({ jsonrpc: "2.0", id: 9, method: "resources/list" }, s)) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
    const batch = (await handleBody([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/x" }], s)) as unknown[];
    expect(batch).toHaveLength(1);
  });
});

describe("works with the official MCP client", () => {
  let server: http.Server;
  let url: URL;
  const store = memoryStore();

  beforeAll(async () => {
    // A Node stand-in for the edge function: same handler, same HTTP behavior.
    server = http.createServer(async (req, res) => {
      if (req.method !== "POST") { res.writeHead(405).end(); return; }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const out = await handleBody(JSON.parse(raw), store);
      if (out === null) { res.writeHead(202).end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(out));
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
  });
  afterAll(() => server.close());

  it("connects, lists tools and prompts, and calls a tool", async () => {
    const client = new Client({ name: "pulse-find-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(url));
    expect(client.getServerVersion()?.name).toBe("pulse-find");

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([
      "get_summary", "list_applications", "add_application", "update_application", "process_job_email", "check_job_scam", "search_jobs",
    ]);

    const added = await client.callTool({ name: "add_application", arguments: { company: "Stripe", role: "SWE Intern" } });
    expect(added.isError).toBe(false);
    const jobs = await client.callTool({ name: "search_jobs", arguments: { query: "stripe" } });
    expect((jobs.structuredContent as { count: number }).count).toBe(1);

    const { prompts } = await client.listPrompts();
    expect(prompts[0].name).toBe("scan_inbox");
    const p = await client.getPrompt({ name: "scan_inbox", arguments: { days: "14" } });
    expect((p.messages[0].content as { text: string }).text).toContain("last 14 days");
    await client.close();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { answerTaskQuestion, buildTaskAgentHandoff, type TaskChatContext } from "../task-chat";
import type { Application, Contact, TrackerEvent } from "../types";

// Two related networking due-date gaps from the pass-13 audit.
//
// 1. On the Networking page, overdue and due-today contacts showed only
// the tag "Overdue" / "Due today" with no date, while the dashboard
// panel shows "Overdue · Nov 14". The tag now always carries the date,
// matching the dashboard format.
//
// 2. A contact with a due date but an empty next step vanished entirely:
// dueBucket required a non-empty step. The date alone now decides the
// bucket, so the contact shows up in the due lists everywhere (dashboard
// panel, Networking page, Ask Pulse) with a "Follow up" fallback where a
// step would render. The fallback is date-gated in the task chat: an
// undated contact with no step gets no step text at all, so a
// connect-only contact is never told to follow up.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const networking = read("components/pipeline/NetworkingSection.tsx");
const taskChat = read("lib/task-chat.ts");
const overview = read("components/dashboard/Overview.tsx");

describe("Networking page due tags", () => {
  it("shows the due date in the tag for every bucket, not just later ones", () => {
    expect(networking).toContain("`${BUCKET_LABEL[bucket]} · ${fmtDate(c.next_step_on)}`");
    expect(networking).not.toContain(
      'bucket === "overdue" || bucket === "today" ? BUCKET_LABEL[bucket] :',
    );
  });

  it("shows the Follow up fallback line for a dated contact with no step", () => {
    expect(networking).toContain('(c.next_step || bucket !== "none") && (');
    expect(networking).toContain('Next: {c.next_step.trim() || "Follow up"}');
  });

  it("offers Step done for a dated contact with no step, so the due state is clearable", () => {
    expect(networking).toContain(
      '{(c.next_step || c.next_step_on) && <button className={btn.secondary} onClick={() => markDone(c)}>Step done</button>}',
    );
  });
});

describe("blank-step contacts in task chat", () => {
  const TODAY = "2026-11-15";
  const APP: Application = {
    id: "app-1",
    company: "Northwind Labs",
    role: "Software Engineer Intern",
    track: "Internship",
    status: "OA Received",
    date_applied: "2026-11-10",
    last_contact: "2026-11-12",
    oa_received: true,
    interviews_done: 0,
    latest_update: "",
    link: "",
    notes: "",
    action_needed: "Finish the HackerRank",
    action_due: "2026-11-20",
  };
  const EVENTS: TrackerEvent[] = [];
  const ctx = (contacts: Contact[]): TaskChatContext => ({
    app: APP,
    events: EVENTS,
    contacts,
    today: TODAY,
    origin: "https://pulsefind-app.vercel.app",
      trackerPath: "/app",
  });
  const datedBlank: Contact = {
    id: "c-blank",
    person_name: "No Step Nora",
    company: "Northwind Labs",
    status: "Connected",
    next_step: "",
    next_step_on: TODAY,
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  };
  const undatedBlank: Contact = {
    id: "c-undated",
    person_name: "Sam Ortiz",
    company: "Northwind Labs",
    status: "Connected",
    next_step: "",
    next_step_on: null,
    notes: "",
    linkedin_url: "",
    last_contacted: null,
  };

  it("names a dated blank-step contact with the Follow up fallback", () => {
    const a = answerTaskQuestion("Who do I know here?", ctx([datedBlank]));
    expect(a.text).toContain("- No Step Nora: Follow up (Nov 15)");
  });

  it("gives an undated blank-step contact no step text at all", () => {
    const a = answerTaskQuestion("Who do I know here?", ctx([undatedBlank]));
    expect(a.text).toContain("- Sam Ortiz");
    expect(a.text).not.toContain("Follow up");
    expect(a.text).not.toContain("no date set");
  });

  it("carries the fallback into the agent handoff prompt", () => {
    const h = buildTaskAgentHandoff({ ctx: ctx([datedBlank]), messages: [] });
    expect(h).toContain("- No Step Nora: Follow up (Nov 15)");
  });

  it("pins the date-gated fallback in the task-chat source", () => {
    expect(taskChat).toContain('const step = c.next_step.trim() || (c.next_step_on ? "Follow up" : "");');
  });
});

describe("dashboard panel fallback", () => {
  it("renders Follow up with the name for a blank step, whitespace included", () => {
    expect(overview).toContain("c.next_step.trim() || `Follow up with ${c.person_name}`");
  });
});

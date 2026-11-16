import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { accountStore } from "../store";
import { accountPipelineStore } from "../pipeline";
import { emptyApplication, emptyContact, emptyLead } from "../types";
import { todayISO } from "../metrics";

// Isolation is enforced twice: the database's row-level security, and an
// explicit `.eq("user_id", userId)` on every account-store query. These
// tests pin the second layer, so a self-hosted instance with misconfigured
// RLS still cannot read or write another user's rows. They run against a
// recording stand-in for the Supabase client, never the network.

const USER = "user-1";

type Call = { table: string; method: string; args: unknown[] };

class FakeQuery {
  private calls: Call[];
  private table: string;
  private last = "";

  constructor(calls: Call[], table: string) {
    this.calls = calls;
    this.table = table;
  }

  private record(method: string, args: unknown[]): this {
    this.calls.push({ table: this.table, method, args });
    this.last = method;
    return this;
  }

  select(...args: unknown[]): this {
    return this.record("select", args);
  }

  insert(...args: unknown[]): this {
    return this.record("insert", args);
  }

  update(...args: unknown[]): this {
    return this.record("update", args);
  }

  delete(...args: unknown[]): this {
    return this.record("delete", args);
  }

  eq(column: string, value: unknown): this {
    return this.record("eq", [column, value]);
  }

  order(...args: unknown[]): this {
    return this.record("order", args);
  }

  limit(...args: unknown[]): this {
    return this.record("limit", args);
  }

  single(): this {
    return this.record("single", []);
  }

  maybeSingle(): this {
    return this.record("maybeSingle", []);
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.last === "single" ? {} : this.last === "maybeSingle" ? null : [];
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function recordingClient(): { client: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => new FakeQuery(calls, table),
  } as unknown as SupabaseClient;
  return { client, calls };
}

/** True when the calls after `from` include `.eq("user_id", USER)` on `table`. */
function scopedToUser(calls: Call[], table: string, from: number): boolean {
  return calls
    .slice(from)
    .some((c) => c.table === table && c.method === "eq" && c.args[0] === "user_id" && c.args[1] === USER);
}

/** Every row in an insert payload must carry the caller's user_id. */
function insertsStampedUser(calls: Call[], table: string, from: number): boolean {
  const insert = calls.slice(from).find((c) => c.table === table && c.method === "insert");
  if (!insert) return false;
  const payload = insert.args[0];
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.every(
    (row) => typeof row === "object" && row !== null && (row as Record<string, unknown>).user_id === USER,
  );
}

describe("account stores scope every query to the signed-in user", () => {
  it("loads applications, events and settings only for that user", async () => {
    const { client, calls } = recordingClient();
    const mark = calls.length;
    await accountStore(client, USER).load();
    expect(scopedToUser(calls, "applications", mark)).toBe(true);
    expect(scopedToUser(calls, "events", mark)).toBe(true);
    expect(scopedToUser(calls, "profiles", mark)).toBe(true);
  });

  it("stamps the user onto created applications and events", async () => {
    const { client, calls } = recordingClient();
    const store = accountStore(client, USER);
    let mark = calls.length;
    await store.create({ ...emptyApplication(todayISO()), company: "Test Co" });
    expect(insertsStampedUser(calls, "applications", mark)).toBe(true);
    mark = calls.length;
    await store.createMany([
      { ...emptyApplication(todayISO()), company: "First Co" },
      { ...emptyApplication(todayISO()), company: "Second Co" },
    ]);
    expect(insertsStampedUser(calls, "applications", mark)).toBe(true);
    mark = calls.length;
    await store.addEvent({ application_id: "app-1", event_date: todayISO(), kind: "Applied", details: "sent" });
    expect(insertsStampedUser(calls, "events", mark)).toBe(true);
  });

  it("updates and deletes applications only when id and user both match", async () => {
    const { client, calls } = recordingClient();
    const store = accountStore(client, USER);
    let mark = calls.length;
    await store.update("app-1", { status: "Interviewing" });
    expect(scopedToUser(calls, "applications", mark)).toBe(true);
    expect(
      calls.slice(mark).some((c) => c.table === "applications" && c.method === "eq" && c.args[0] === "id"),
    ).toBe(true);
    mark = calls.length;
    await store.remove("app-1");
    expect(scopedToUser(calls, "applications", mark)).toBe(true);
    mark = calls.length;
    await store.saveSettings({ display_name: "K", ghost_days: 10, weekly_goal: 5 });
    expect(scopedToUser(calls, "profiles", mark)).toBe(true);
  });

  it("loads leads and contacts only for that user", async () => {
    const { client, calls } = recordingClient();
    const pipeline = accountPipelineStore(client, USER);
    let mark = calls.length;
    await pipeline.loadLeads();
    expect(scopedToUser(calls, "job_leads", mark)).toBe(true);
    mark = calls.length;
    await pipeline.loadContacts();
    expect(scopedToUser(calls, "networking_contacts", mark)).toBe(true);
  });

  it("stamps the user onto created leads and contacts", async () => {
    const { client, calls } = recordingClient();
    const pipeline = accountPipelineStore(client, USER);
    let mark = calls.length;
    await pipeline.createLead({ ...emptyLead(todayISO()), company: "Test Co" });
    expect(insertsStampedUser(calls, "job_leads", mark)).toBe(true);
    mark = calls.length;
    await pipeline.createContact({ ...emptyContact(), person_name: "Test Person" });
    expect(insertsStampedUser(calls, "networking_contacts", mark)).toBe(true);
  });

  it("updates and deletes leads and contacts only when id and user both match", async () => {
    const { client, calls } = recordingClient();
    const pipeline = accountPipelineStore(client, USER);
    let mark = calls.length;
    await pipeline.updateLead("lead-1", { status: "Queued" });
    expect(scopedToUser(calls, "job_leads", mark)).toBe(true);
    mark = calls.length;
    await pipeline.removeLead("lead-1");
    expect(scopedToUser(calls, "job_leads", mark)).toBe(true);
    mark = calls.length;
    await pipeline.updateContact("contact-1", { next_step: "Follow up" });
    expect(scopedToUser(calls, "networking_contacts", mark)).toBe(true);
    mark = calls.length;
    await pipeline.removeContact("contact-1");
    expect(scopedToUser(calls, "networking_contacts", mark)).toBe(true);
  });
});

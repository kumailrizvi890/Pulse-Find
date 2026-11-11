import { describe, expect, it } from "vitest";
import { demoStore } from "../store";
import { todayISO } from "../metrics";
import { emptyApplication } from "../types";

// The demo store is the in-memory implementation behind the public /demo:
// pure CRUD over the seed data, no Supabase involved.
const input = (company: string) => ({ ...emptyApplication(todayISO()), company, role: "SWE Intern" });

describe("demoStore", () => {
  it("loads the seed applications with demo settings", async () => {
    const store = demoStore();
    expect(store.kind).toBe("demo");
    const { apps, settings } = await store.load();
    expect(apps).toHaveLength(22);
    expect(settings).toMatchObject({ display_name: "Demo", weekly_goal: 8, ghost_days: 21 });
  });

  it("seeds events that all point at real applications", async () => {
    const { apps, events } = await demoStore().load();
    const ids = new Set(apps.map((a) => a.id));
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => ids.has(e.application_id))).toBe(true);
  });

  it("hands back a copy of the list, not the store's own array", async () => {
    const store = demoStore();
    (await store.load()).apps.pop();
    expect((await store.load()).apps).toHaveLength(22);
  });

  it("creates an application with an id and puts it first", async () => {
    const store = demoStore();
    const made = await store.create(input("Test Co"));
    expect(made.id).toBeTruthy();
    expect(made.company).toBe("Test Co");
    const { apps } = await store.load();
    expect(apps).toHaveLength(23);
    expect(apps[0].id).toBe(made.id);
  });

  it("creates many at once, preserving their order at the front", async () => {
    const store = demoStore();
    const made = await store.createMany([input("First Co"), input("Second Co")]);
    const { apps } = await store.load();
    expect(apps).toHaveLength(24);
    expect(apps.slice(0, 2).map((a) => a.id)).toEqual(made.map((a) => a.id));
  });

  it("updates fields in place and rejects unknown ids", async () => {
    const store = demoStore();
    const made = await store.create(input("Patch Co"));
    const updated = await store.update(made.id, { status: "Interviewing", interviews_done: 2 });
    expect(updated.status).toBe("Interviewing");
    expect(updated.company).toBe("Patch Co"); // untouched fields survive the patch
    await expect(store.update("no-such-id", { status: "Applied" })).rejects.toThrow("no longer exists");
  });

  it("removing an application also removes its events", async () => {
    const store = demoStore();
    const made = await store.create(input("Doomed Co"));
    await store.addEvent({ application_id: made.id, event_date: todayISO(), kind: "Applied", details: "sent" });
    await store.remove(made.id);
    const { apps, events } = await store.load();
    expect(apps.some((a) => a.id === made.id)).toBe(false);
    expect(events.some((e) => e.application_id === made.id)).toBe(false);
    expect(events.length).toBeGreaterThan(0); // everyone else's events survive
  });

  it("prepends new events and round-trips settings", async () => {
    const store = demoStore();
    const ev = await store.addEvent({ application_id: "demo-1", event_date: todayISO(), kind: "OA Received", details: "link sent" });
    expect(ev.id).toBeTruthy();
    expect((await store.load()).events[0].id).toBe(ev.id);
    const saved = await store.saveSettings({ display_name: "K", ghost_days: 10, weekly_goal: 5 });
    expect((await store.load()).settings).toEqual(saved);
  });
});

import { describe, expect, it } from "vitest";
import { demoPipelineStore } from "../pipeline";

/**
 * Audit gap #10: the demo seed embedded absolute dates in free text
 * ("thanked Nov 4", "replied Nov 9", "Applied from this lead on Nov 8")
 * while every real seed date is a relative offset from today, so the
 * strings went stale a day after they were written. The seed now
 * computes those dates from today (12 / 7 / 8 days ago), so the demo
 * always reads current. These tests seed two different todays and pin
 * the dates that come out.
 */
describe("demo seed free-text dates stay relative to today", () => {
  it("renders the Nov 16 dates for a Nov 16 seed", async () => {
    const store = demoPipelineStore("2026-11-16");
    const contacts = await store.loadContacts();
    const leads = await store.loadLeads();
    expect(contacts.find((c) => c.person_name === "Priya Nair")?.status).toBe("Connected — thanked Nov 4");
    expect(contacts.find((c) => c.person_name === "Elena Brooks")?.status).toBe("Connected — replied Nov 9");
    expect(leads.find((l) => l.company === "Tidewater Cloud")?.fit_note).toBe("Applied from this lead on Nov 8");
  });

  it("moves the same dates forward when seeded on Dec 1", async () => {
    const store = demoPipelineStore("2026-12-01");
    const contacts = await store.loadContacts();
    const leads = await store.loadLeads();
    expect(contacts.find((c) => c.person_name === "Priya Nair")?.status).toBe("Connected — thanked Nov 19");
    expect(contacts.find((c) => c.person_name === "Elena Brooks")?.status).toBe("Connected — replied Nov 24");
    expect(leads.find((l) => l.company === "Tidewater Cloud")?.fit_note).toBe("Applied from this lead on Nov 23");
  });

  it("keeps the relative offsets, not the old hardcoded strings", async () => {
    const store = demoPipelineStore("2026-12-20");
    const contacts = await store.loadContacts();
    const leads = await store.loadLeads();
    const texts = [...contacts.map((c) => c.status), ...leads.map((l) => l.fit_note)];
    expect(texts.join(" ")).not.toContain("Nov 4");
    expect(texts.join(" ")).not.toContain("Nov 9");
    expect(texts.join(" ")).not.toContain("Nov 8");
    expect(contacts.find((c) => c.person_name === "Priya Nair")?.status).toBe("Connected — thanked Dec 8");
  });
});

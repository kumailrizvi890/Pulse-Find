import { describe, expect, it } from "vitest";
import { demoPipelineStore, dueBucket, leadKey, sortContacts } from "../pipeline";
import { emptyContact, emptyLead, type Contact } from "../types";

const TODAY = "2026-11-11";

describe("demoPipelineStore leads", () => {
  it("loads the seeded leads across the pipeline statuses", async () => {
    const leads = await demoPipelineStore(TODAY).loadLeads();
    expect(leads).toHaveLength(6);
    expect(new Set(leads.map((l) => l.status))).toEqual(new Set(["New", "Queued", "Applied", "Problem", "Not eligible"]));
  });

  it("creates, updates and deletes leads", async () => {
    const store = demoPipelineStore(TODAY);
    const made = await store.createLead({ ...emptyLead(TODAY), company: "Test Co", role: "SWE Intern" });
    expect(made.id).toBeTruthy();
    expect((await store.loadLeads())[0].id).toBe(made.id);

    const next = await store.updateLead(made.id, { status: "Queued", fit_note: "Strong fit" });
    expect(next.status).toBe("Queued");
    expect(next.company).toBe("Test Co"); // untouched fields survive

    await expect(store.updateLead("nope", { status: "Closed" })).rejects.toThrow("no longer exists");
    await store.removeLead(made.id);
    expect((await store.loadLeads()).some((l) => l.id === made.id)).toBe(false);
  });

  it("leadKey dedupes on company + role, ignoring case and padding", () => {
    expect(leadKey({ company: " Stripe ", role: "SWE Intern" })).toBe(leadKey({ company: "stripe", role: "swe intern" }));
    expect(leadKey({ company: "Stripe", role: "SWE Intern" })).not.toBe(leadKey({ company: "Stripe", role: "PM Intern" }));
  });
});

describe("networking due buckets", () => {
  const contact = (patch: Partial<Contact>): Contact => ({
    id: "c", person_name: "P", company: "", status: "", next_step: "Follow up", next_step_on: null, notes: "", ...patch,
  });

  it("classifies overdue / today / upcoming / later / none", () => {
    expect(dueBucket(contact({ next_step_on: "2026-11-10" }), TODAY)).toBe("overdue");
    expect(dueBucket(contact({ next_step_on: "2026-11-11" }), TODAY)).toBe("today");
    expect(dueBucket(contact({ next_step_on: "2026-11-15" }), TODAY)).toBe("upcoming");
    expect(dueBucket(contact({ next_step_on: "2026-12-25" }), TODAY)).toBe("later");
    expect(dueBucket(contact({ next_step_on: null }), TODAY)).toBe("none");
    expect(dueBucket(contact({ next_step: "  ", next_step_on: "2026-11-01" }), TODAY)).toBe("none");
  });

  it("sorts overdue first, undated last, then by name", () => {
    const rows = sortContacts(
      [
        contact({ id: "1", person_name: "Zed", next_step_on: null }),
        contact({ id: "2", person_name: "Amy", next_step_on: "2026-11-20" }),
        contact({ id: "3", person_name: "Bob", next_step_on: "2026-11-01" }),
        contact({ id: "4", person_name: "Cid", next_step_on: "2026-11-11" }),
      ],
      TODAY,
    );
    expect(rows.map((r) => r.person_name)).toEqual(["Bob", "Cid", "Amy", "Zed"]);
  });

  it("round-trips contacts through the demo store", async () => {
    const store = demoPipelineStore(TODAY);
    expect(await store.loadContacts()).toHaveLength(4);
    const made = await store.createContact({ ...emptyContact(), person_name: "New Person", next_step: "Say thanks", next_step_on: TODAY });
    const updated = await store.updateContact(made.id, { next_step: "", next_step_on: null });
    expect(updated.next_step).toBe("");
    await store.removeContact(made.id);
    expect((await store.loadContacts()).some((c) => c.id === made.id)).toBe(false);
  });
});

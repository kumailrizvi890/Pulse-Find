import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, ContactInput, ISODate, Lead, LeadInput } from "./types";
import { addDays, daysBetween, todayISO } from "./metrics";

/**
 * Leads + networking data access. Same split as the tracker store:
 * an in-memory implementation for /demo and a Supabase one for accounts,
 * where row-level security limits every query to the signed-in user's rows.
 */
export interface PipelineStore {
  readonly kind: "demo" | "account";
  loadLeads(): Promise<Lead[]>;
  createLead(input: LeadInput): Promise<Lead>;
  updateLead(id: string, patch: Partial<LeadInput>): Promise<Lead>;
  removeLead(id: string): Promise<void>;
  loadContacts(): Promise<Contact[]>;
  createContact(input: ContactInput): Promise<Contact>;
  updateContact(id: string, patch: Partial<ContactInput>): Promise<Contact>;
  removeContact(id: string): Promise<void>;
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();

/** Dedupe identity for a lead: same company + role (case-insensitive) is the same lead. */
export function leadKey(l: Pick<Lead, "company" | "role">): string {
  return `${l.company.trim().toLowerCase()}::${l.role.trim().toLowerCase()}`;
}

export type DueBucket = "overdue" | "today" | "upcoming" | "later" | "none";

/** Where a contact's next step falls relative to today. Contacts with no step or no date are "none". */
export function dueBucket(c: Pick<Contact, "next_step" | "next_step_on">, today: ISODate): DueBucket {
  if (!c.next_step.trim() || !c.next_step_on) return "none";
  const d = daysBetween(today, c.next_step_on);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "upcoming";
  return "later";
}

const BUCKET_ORDER: Record<DueBucket, number> = { overdue: 0, today: 1, upcoming: 2, later: 3, none: 4 };

/** Contacts ordered so the most urgent next steps come first; undated last, then by name. */
export function sortContacts(contacts: Contact[], today: ISODate): Contact[] {
  return [...contacts].sort(
    (a, b) =>
      BUCKET_ORDER[dueBucket(a, today)] - BUCKET_ORDER[dueBucket(b, today)] ||
      (a.next_step_on ?? "9999").localeCompare(b.next_step_on ?? "9999") ||
      a.person_name.localeCompare(b.person_name),
  );
}

// ---------- demo data (invented, relative dates so it always looks current) ----------

function demoLeads(today: ISODate): Lead[] {
  const mk = (i: number, l: Omit<Lead, "id" | "date_found"> & { found: number }): Lead => {
    const { found, ...rest } = l;
    return { ...rest, id: `demo-lead-${i + 1}`, date_found: addDays(today, -found) };
  };
  return [
    mk(0, { company: "Westfield Labs", role: "Software Engineer Intern", track: "Internship", location: "Seattle, WA", pay: "$48/hr", url: "", source: "Job board", status: "Queued", fit_note: "Strong match: TypeScript + product team", found: 1 }),
    mk(1, { company: "Copperline", role: "Machine Learning Intern", track: "Internship", location: "Remote", pay: "", url: "", source: "Agent scan", status: "New", fit_note: "Python ML stack, small team", found: 0 }),
    mk(2, { company: "Brightwater Health", role: "Frontend Engineer, New Grad", track: "New Grad", location: "Austin, TX", pay: "$95k", url: "", source: "Job board", status: "New", fit_note: "React role; healthcare data product", found: 2 }),
    mk(3, { company: "Atlas Robotics", role: "Software Intern, Perception", track: "Internship", location: "Pittsburgh, PA", pay: "", url: "", source: "Referral", status: "Problem", fit_note: "Posting closed early — watch for the spring repost", found: 6 }),
    mk(4, { company: "Fernhill Capital", role: "Quant Developer Intern", track: "Internship", location: "New York, NY", pay: "$60/hr", url: "", source: "Job board", status: "Not eligible", fit_note: "Requires a master's degree", found: 9 }),
    mk(5, { company: "Tidewater Cloud", role: "SRE Intern", track: "Internship", location: "Remote", pay: "$44/hr", url: "", source: "Agent scan", status: "Applied", fit_note: "Applied from this lead on Nov 8", found: 12 }),
  ];
}

function demoContacts(today: ISODate): Contact[] {
  const mk = (i: number, c: Omit<Contact, "id" | "next_step_on"> & { on: number | null }): Contact => {
    const { on, ...rest } = c;
    return { ...rest, id: `demo-contact-${i + 1}`, next_step_on: on === null ? null : addDays(today, on) };
  };
  return [
    mk(0, { person_name: "Priya Nair", company: "Copperline", status: "Connected — thanked Nov 4", next_step: "Week 2 value touch: one strength + one fix on the portfolio", on: 0, notes: "Recruiter, university programs" }),
    mk(1, { person_name: "Marcus Webb", company: "Atlas Robotics", status: "Messaged — awaiting reply", next_step: "Follow up if no reply", on: -2, notes: "Hiring manager, perception team" }),
    mk(2, { person_name: "Elena Brooks", company: "Westfield Labs", status: "Connected — replied Nov 9", next_step: "Send the project write-up she asked about", on: 3, notes: "Engineer, UW alum" }),
    mk(3, { person_name: "Sam Ortiz", company: "Fernhill Capital", status: "Connected", next_step: "", on: null, notes: "Fellow student — connect only, no follow-up sequence" }),
  ];
}

/** In-memory pipeline store for /demo. Nothing leaves the browser tab. */
export function demoPipelineStore(today: ISODate = todayISO()): PipelineStore {
  let leads = demoLeads(today);
  let contacts = demoContacts(today);
  return {
    kind: "demo",
    async loadLeads() { return [...leads]; },
    async createLead(input) {
      const l = { ...input, id: uid() };
      leads = [l, ...leads];
      return l;
    },
    async updateLead(id, patch) {
      const cur = leads.find((l) => l.id === id);
      if (!cur) throw new Error("That lead no longer exists.");
      const next = { ...cur, ...patch };
      leads = leads.map((l) => (l.id === id ? next : l));
      return next;
    },
    async removeLead(id) { leads = leads.filter((l) => l.id !== id); },
    async loadContacts() { return [...contacts]; },
    async createContact(input) {
      const c = { ...input, id: uid() };
      contacts = [c, ...contacts];
      return c;
    },
    async updateContact(id, patch) {
      const cur = contacts.find((c) => c.id === id);
      if (!cur) throw new Error("That contact no longer exists.");
      const next = { ...cur, ...patch };
      contacts = contacts.map((c) => (c.id === id ? next : c));
      return next;
    },
    async removeContact(id) { contacts = contacts.filter((c) => c.id !== id); },
  };
}

// ---------- account store (Supabase, RLS-scoped) ----------

const LEAD_COLS = "id,company,role,track,location,pay,url,source,status,fit_note,date_found,created_at,updated_at";
const CONTACT_COLS = "id,person_name,company,status,next_step,next_step_on,notes,created_at,updated_at";

function fail(error: { message: string } | null, what: string): never {
  throw new Error(`Couldn't ${what}. ${error?.message ?? "Check your connection and try again."}`);
}

export function accountPipelineStore(supabase: SupabaseClient, userId: string): PipelineStore {
  return {
    kind: "account",
    async loadLeads() {
      const { data, error } = await supabase.from("job_leads").select(LEAD_COLS).order("date_found", { ascending: false });
      if (error) fail(error, "load your leads");
      return (data ?? []) as Lead[];
    },
    async createLead(input) {
      const { data, error } = await supabase.from("job_leads").insert({ ...input, user_id: userId }).select(LEAD_COLS).single();
      if (error) fail(error, "save that lead");
      return data as Lead;
    },
    async updateLead(id, patch) {
      const { data, error } = await supabase.from("job_leads").update(patch).eq("id", id).select(LEAD_COLS).single();
      if (error) fail(error, "save your changes");
      return data as Lead;
    },
    async removeLead(id) {
      const { error } = await supabase.from("job_leads").delete().eq("id", id);
      if (error) fail(error, "delete that lead");
    },
    async loadContacts() {
      const { data, error } = await supabase.from("networking_contacts").select(CONTACT_COLS).order("next_step_on", { ascending: true, nullsFirst: false });
      if (error) fail(error, "load your contacts");
      return (data ?? []) as Contact[];
    },
    async createContact(input) {
      const { data, error } = await supabase.from("networking_contacts").insert({ ...input, user_id: userId }).select(CONTACT_COLS).single();
      if (error) fail(error, "save that contact");
      return data as Contact;
    },
    async updateContact(id, patch) {
      const { data, error } = await supabase.from("networking_contacts").update(patch).eq("id", id).select(CONTACT_COLS).single();
      if (error) fail(error, "save your changes");
      return data as Contact;
    },
    async removeContact(id) {
      const { error } = await supabase.from("networking_contacts").delete().eq("id", id);
      if (error) fail(error, "delete that contact");
    },
  };
}

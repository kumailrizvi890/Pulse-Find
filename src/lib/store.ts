import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, ApplicationInput, Settings, TrackerEvent } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { demoApplications, demoEvents } from "./demo-data";

/** Everything the dashboard needs. The demo and real accounts share one UI through this. */
export interface TrackerStore {
  readonly kind: "demo" | "account";
  load(): Promise<{ apps: Application[]; events: TrackerEvent[]; settings: Settings }>;
  create(input: ApplicationInput): Promise<Application>;
  createMany(inputs: ApplicationInput[]): Promise<Application[]>;
  update(id: string, patch: Partial<ApplicationInput>): Promise<Application>;
  remove(id: string): Promise<void>;
  addEvent(e: Omit<TrackerEvent, "id">): Promise<TrackerEvent>;
  saveSettings(s: Settings): Promise<Settings>;
}

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();

/** In-memory store for /demo. Visitors can click around; nothing leaves the browser tab. */
export function demoStore(): TrackerStore {
  let apps = demoApplications();
  let events = demoEvents(apps);
  let settings: Settings = { ...DEFAULT_SETTINGS, display_name: "Demo", weekly_goal: 8 };
  return {
    kind: "demo",
    async load() {
      return { apps: [...apps], events: [...events], settings };
    },
    async create(input) {
      const a = { ...input, id: uid() };
      apps = [a, ...apps];
      return a;
    },
    async createMany(inputs) {
      const made = inputs.map((i) => ({ ...i, id: uid() }));
      apps = [...made, ...apps];
      return made;
    },
    async update(id, patch) {
      const cur = apps.find((a) => a.id === id);
      if (!cur) throw new Error("That application no longer exists.");
      const next = { ...cur, ...patch };
      apps = apps.map((a) => (a.id === id ? next : a));
      return next;
    },
    async remove(id) {
      apps = apps.filter((a) => a.id !== id);
      events = events.filter((e) => e.application_id !== id);
    },
    async addEvent(e) {
      const ev = { ...e, id: uid() };
      events = [ev, ...events];
      return ev;
    },
    async saveSettings(s) {
      settings = s;
      return s;
    },
  };
}

const APP_COLS =
  "id,company,role,track,status,date_applied,last_contact,oa_received,interviews_done,latest_update,link,notes,action_needed,action_due,created_at,updated_at";

function fail(error: { message: string } | null, what: string): never {
  throw new Error(`Couldn't ${what}. ${error?.message ?? "Check your connection and try again."}`);
}

/** Supabase-backed store. Row-level security limits every query to the signed-in user's rows. */
export function accountStore(supabase: SupabaseClient, userId: string): TrackerStore {
  return {
    kind: "account",
    async load() {
      const [a, e, p] = await Promise.all([
        supabase.from("applications").select(APP_COLS).order("last_contact", { ascending: false }),
        supabase.from("events").select("id,application_id,event_date,kind,details").order("event_date", { ascending: false }).limit(200),
        supabase.from("profiles").select("display_name,ghost_days,weekly_goal").eq("user_id", userId).maybeSingle(),
      ]);
      if (a.error) fail(a.error, "load your applications");
      if (e.error) fail(e.error, "load your activity");
      return {
        apps: (a.data ?? []) as Application[],
        events: (e.data ?? []) as TrackerEvent[],
        settings: (p.data as Settings | null) ?? DEFAULT_SETTINGS,
      };
    },
    async create(input) {
      const { data, error } = await supabase.from("applications").insert({ ...input, user_id: userId }).select(APP_COLS).single();
      if (error) fail(error, "save that application");
      return data as Application;
    },
    async createMany(inputs) {
      if (!inputs.length) return [];
      const out: Application[] = [];
      for (let i = 0; i < inputs.length; i += 200) {
        const chunk = inputs.slice(i, i + 200).map((r) => ({ ...r, user_id: userId }));
        const { data, error } = await supabase.from("applications").insert(chunk).select(APP_COLS);
        if (error) fail(error, "import those rows");
        out.push(...((data ?? []) as Application[]));
      }
      return out;
    },
    async update(id, patch) {
      const { data, error } = await supabase.from("applications").update(patch).eq("id", id).select(APP_COLS).single();
      if (error) fail(error, "save your changes");
      return data as Application;
    },
    async remove(id) {
      const { error } = await supabase.from("applications").delete().eq("id", id);
      if (error) fail(error, "delete that application");
    },
    async addEvent(e) {
      const { data, error } = await supabase
        .from("events")
        .insert({ ...e, user_id: userId })
        .select("id,application_id,event_date,kind,details")
        .single();
      if (error) fail(error, "log that update");
      return data as TrackerEvent;
    },
    async saveSettings(s) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ ghost_days: s.ghost_days, weekly_goal: s.weekly_goal, display_name: s.display_name })
        .eq("user_id", userId)
        .select("display_name,ghost_days,weekly_goal")
        .single();
      if (error) fail(error, "save your settings");
      return data as Settings;
    },
  };
}

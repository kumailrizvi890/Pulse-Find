// Supabase Edge Function: day-before deadline reminders.
// Runs once a day from pg_cron (see supabase/migrations/
// 20261125000000_weeks1_3_backend.sql). Finds applications whose
// action_due is tomorrow, groups them per user, and sends ONE digest
// email per user through the Resend HTTP API — no SDK, plain fetch.
//
// Reliable delivery needs the owner to set RESEND_API_KEY as an
// edge-function secret, and the sending address to be a verified sender
// in Resend (or the equivalent custom SMTP setup in the Supabase
// dashboard). Until the key exists this function sends nothing and
// says so. Sends are recorded in reminder_runs (one row per user per
// reminder date) so a retried run never double-sends the same day.
//
// The digest text is duplicated from src/lib/reminders.ts: Deno edge
// functions cannot import from src/lib, and the Next.js copy is the
// one covered by unit tests.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const FROM = "Pulse Find <reminders@pulsefind-app.vercel.app>";
const CLOSED = ["Rejected", "Withdrawn", "Accepted"];

const pad = (n: number) => String(n).padStart(2, "0");
const toISODate = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const tomorrowISO = (today: string) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISODate(d);
};

interface DueApp {
  user_id: string;
  company: string;
  role: string;
  action_needed: string;
  action_due: string;
  status: string;
}

function buildDigest(apps: DueApp[], dueDate: string): { subject: string; text: string } {
  const n = apps.length;
  const subject = `${n} deadline${n === 1 ? "" : "s"} due tomorrow — Pulse Find`;
  const pretty = new Date(`${dueDate}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const lines = apps.map((a) => {
    const what = (a.action_needed ?? "").trim() || "Follow up";
    const role = (a.role ?? "").trim() ? ` — ${a.role.trim()}` : "";
    return `- ${a.company}${role}: ${what}`;
  });
  const text = [
    "Hi,",
    "",
    `You have ${n} application deadline${n === 1 ? "" : "s"} due tomorrow (${pretty}):`,
    "",
    ...lines,
    "",
    "Good luck — open Pulse Find to tick them off: https://pulsefind-app.vercel.app/app",
  ].join("\n");
  return { subject, text };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "RESEND_API_KEY is not set as an edge-function secret" }, 500);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const today = toISODate(new Date());
  const dueDate = tomorrowISO(today);

  const { data: apps, error } = await db
    .from("applications")
    .select("user_id,company,role,action_needed,action_due,status")
    .eq("action_due", dueDate);
  if (error || !apps) return json({ error: `Couldn't read applications: ${error?.message ?? "empty"}` }, 500);

  const groups = new Map<string, DueApp[]>();
  for (const app of apps as DueApp[]) {
    if (CLOSED.includes(app.status ?? "")) continue;
    const list = groups.get(app.user_id) ?? [];
    list.push(app);
    groups.set(app.user_id, list);
  }

  let sent = 0;
  let skipped = 0;
  for (const [userId, userApps] of groups) {
    // Already reminded about this date? A retry must not double-send.
    const { data: prior } = await db
      .from("reminder_runs")
      .select("id")
      .eq("user_id", userId)
      .eq("reminder_date", dueDate)
      .maybeSingle();
    if (prior) {
      skipped++;
      continue;
    }
    const { data: { user } } = await db.auth.admin.getUserById(userId);
    if (!user?.email) {
      skipped++;
      continue;
    }
    const { subject, text } = buildDigest(userApps, dueDate);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: user.email, subject, text }),
    });
    if (!res.ok) {
      console.error(`remind: Resend failed for ${userId}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      skipped++;
      continue;
    }
    const { error: logError } = await db.from("reminder_runs").insert({
      user_id: userId,
      reminder_date: dueDate,
      applications_count: userApps.length,
    });
    if (logError) console.error(`remind: could not record run for ${userId}: ${logError.message}`);
    sent++;
  }
  return json({ sent, skipped, due_date: dueDate });
});

// Pure digest-building logic for the day-before deadline reminders.
// Shared by the remind edge function (which duplicates this small file
// inline, because Deno edge functions cannot import from src/lib) and
// covered by unit tests here.

export interface DueApplication {
  company: string;
  role: string;
  action_needed: string;
  action_due: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a Date, in UTC, so server and test agree. */
export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** YYYY-MM-DD for tomorrow, given today's YYYY-MM-DD. */
export function tomorrowISO(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return toISODate(d);
}

/** Applications whose action is due on `dueDate` (YYYY-MM-DD). */
export function dueOn(apps: DueApplication[], dueDate: string): DueApplication[] {
  return apps.filter((a) => a.action_due === dueDate);
}

/** Group applications by user id. */
export function groupByUser<T extends { user_id: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.user_id) ?? [];
    list.push(row);
    groups.set(row.user_id, list);
  }
  return groups;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** One digest email per user: subject + plain-text body. */
export function buildReminderDigest(apps: DueApplication[], dueDate: string): { subject: string; text: string } {
  const n = apps.length;
  const subject = `${n} deadline${n === 1 ? "" : "s"} due tomorrow — Pulse Find`;
  const lines = apps.map((a) => {
    const what = a.action_needed.trim() || "Follow up";
    const role = a.role.trim() ? ` — ${a.role.trim()}` : "";
    return `- ${a.company}${role}: ${what}`;
  });
  const text = [
    `Hi,`,
    ``,
    `You have ${n} application deadline${n === 1 ? "" : "s"} due tomorrow (${prettyDate(dueDate)}):`,
    ``,
    ...lines,
    ``,
    `Good luck — open Pulse Find to tick them off: https://pulsefind-app.vercel.app/app`,
  ].join("\n");
  return { subject, text };
}

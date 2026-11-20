// One shared home for the relative-date wording, so a post from
// yesterday evening reads as yesterday everywhere — the details panel,
// the swipe deck, the dashboard's newest openings, and the jobs list —
// instead of each view keeping its own copy that counts elapsed 24h
// periods and reads "today" after midnight.
//
// Whole calendar days between two moments in the visitor's local
// timezone. Math.round, not floor: a DST day is 23 or 25 hours long,
// but it is still one calendar day.
export function calendarDaysBetween(from: Date, to: Date) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

/** Relative posted date in whole calendar days: "today", "1d ago", "2d ago", "1mo ago". */
export function ago(iso: string | null) {
  if (!iso) return "";
  const days = calendarDaysBetween(new Date(iso), new Date());
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** The deck and details wording: "Posted today" / "Posted yesterday" /
 * "Posted 2d ago". Same calendar-day count as ago(), but the wording
 * is the one those views always had — including "Posted 45d ago" past
 * a month, where the bare ago() rolls over to "1mo ago". Keeping the
 * exact old wording here is deliberate: this pass only fixes the
 * calendar-day count, it does not reword anything a visitor reads. */
export function postedAgo(iso: string | null) {
  if (!iso) return null;
  const days = calendarDaysBetween(new Date(iso), new Date());
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  return `Posted ${days}d ago`;
}

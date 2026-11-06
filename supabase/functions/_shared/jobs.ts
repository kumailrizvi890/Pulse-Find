// Pure, dependency-free job board logic shared by the Next.js app, the unit tests and the
// `refresh-jobs` Supabase Edge Function (Deno). Keep it free of imports.

export type Source = "greenhouse" | "lever" | "ashby";
export type Track = "Internship" | "New Grad" | "Full-Time" | "Part-Time" | "Other";

export interface NormalizedJob {
  id: string;
  source: Source;
  board: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  track: Track;
  tech: boolean;
  posted_at: string | null;
}

const TECH_KEYWORDS = [
  "software", "engineer", "developer", "programmer", "computer", "sde", "swe", "data", "machine learning",
  "ml ", " ml", " ai", "ai ", "ai/", "cyber", "security engineer", "devops", "cloud", "backend", "back end",
  "back-end", "frontend", "front end", "front-end", "full stack", "full-stack", "fullstack", "product manager",
  "it support", "qa ", "test engineer", "mobile", "ios", "android", "web", "technology", "tech ", "quant",
  "infrastructure", "platform", "sre", "site reliability", "research scientist", "firmware", "embedded",
];

/** True when a role title reads like a tech role. Padded so edge words like "AI" match. */
export function isTechRole(title: string): boolean {
  const t = ` ${title.toLowerCase()} `;
  return TECH_KEYWORDS.some((k) => t.includes(k));
}

const INTERN = /\b(intern|internship|co-?op|apprentice(ship)?|summer (analyst|associate)|working student)\b/i;
const NEW_GRAD = /\b(new ?grad(uate)?|university grad(uate)?|early career|entry[- ]level|recent grad(uate)?|graduate (program|scheme|engineer)|campus|class of 20\d\d|20\d\d grad|junior|associate (software|data|product|engineer|developer))\b/i;
const SENIOR = /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|architect)\b/i;

export function trackOf(title: string, commitment = ""): Track {
  if (INTERN.test(title)) return "Internship";
  if (NEW_GRAD.test(title) && !SENIOR.test(title)) return "New Grad";
  if (/part[- ]?time/i.test(`${title} ${commitment}`)) return "Part-Time";
  if (/full[- ]?time/i.test(commitment) || commitment === "FullTime") return "Full-Time";
  return "Other";
}

const isRemoteText = (s: string) => /\bremote\b|anywhere|distributed/i.test(s);
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const httpsOnly = (u: unknown) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

type Board = { source: Source; slug: string; company: string };

export function boardUrl(b: Board): string {
  switch (b.source) {
    case "greenhouse": return `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs`;
    case "lever": return `https://api.lever.co/v0/postings/${b.slug}?mode=json`;
    case "ashby": return `https://api.ashbyhq.com/posting-api/job-board/${b.slug}`;
  }
}

/** Turns one board's raw JSON response into normalized jobs, skipping anything malformed. */
export function normalizeBoard(b: Board, raw: unknown): NormalizedJob[] {
  const out: NormalizedJob[] = [];
  const push = (j: Omit<NormalizedJob, "source" | "board" | "company" | "track" | "tech"> & { commitment?: string }) => {
    const title = clean(j.title);
    if (!title || !j.url || !j.id) return;
    const { commitment, ...rest } = j;
    out.push({
      ...rest,
      title,
      location: clean(j.location).slice(0, 200),
      id: `${b.source}:${b.slug}:${j.id}`,
      source: b.source,
      board: b.slug,
      company: b.company,
      track: trackOf(title, commitment ?? ""),
      tech: isTechRole(title),
    });
  };

  if (b.source === "greenhouse") {
    const jobs = (raw as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(jobs)) return out;
    for (const j of jobs as Record<string, unknown>[]) {
      const loc = clean((j.location as { name?: string } | undefined)?.name);
      push({ id: String(j.id ?? ""), title: clean(j.title), location: loc, remote: isRemoteText(loc), url: httpsOnly(j.absolute_url), posted_at: iso(j.first_published ?? j.updated_at) });
    }
  } else if (b.source === "lever") {
    if (!Array.isArray(raw)) return out;
    for (const j of raw as Record<string, unknown>[]) {
      const cat = (j.categories ?? {}) as { location?: string; commitment?: string; allLocations?: string[] };
      const loc = clean(cat.allLocations?.length ? cat.allLocations.join(" · ") : cat.location);
      push({ id: String(j.id ?? ""), title: clean(j.text), location: loc, remote: j.workplaceType === "remote" || isRemoteText(loc), url: httpsOnly(j.hostedUrl), posted_at: iso(j.createdAt), commitment: cat.commitment });
    }
  } else {
    const jobs = (raw as { jobs?: unknown[] })?.jobs;
    if (!Array.isArray(jobs)) return out;
    for (const j of jobs as Record<string, unknown>[]) {
      if (j.isListed === false) continue;
      const loc = clean(j.location);
      push({ id: String(j.id ?? ""), title: clean(j.title), location: loc, remote: j.isRemote === true || j.workplaceType === "Remote" || isRemoteText(loc), url: httpsOnly(j.jobUrl), posted_at: iso(j.publishedAt), commitment: clean(j.employmentType) });
    }
  }
  return out;
}

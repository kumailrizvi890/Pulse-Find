import { demoApplications } from "./demo-data";

// Resume parser (landing only, Nov 20 2026): client-side only. The
// visitor pastes text or drops a .txt file, or a PDF read in the
// browser with pdf.js from a CDN. Nothing is uploaded anywhere; the
// parse runs in this module, in the visitor's browser, against the
// repo's demo job data (the fictional companies and roles in
// demo-data.ts), never real user data and never the live job board.
//
// Live matching would need a backend: the real board lives in
// Supabase and is paged, so a server route would fetch roles, score
// them, and return matches. See NOTES.md in the preview package.

export interface ParsedResume {
  skills: string[];
  yearsExperience: number | null;
  titles: string[];
  education: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinks: boolean;
  wordCount: number;
  bulletCount: number;
  quantifiedBullets: number;
}

export interface RoleMatch {
  company: string;
  role: string;
  track: string;
  matched: string[];
  missing: string[];
  score: number; // 0 to 100
}

export interface ResumeTips {
  missingSkills: string[];
  tips: string[];
}

/** Skill vocabulary, normalized key to display name. Matching is
 * case-insensitive and word-boundary aware, so "Go" never matches
 * "Google" and "C" never matches "CSS". */
export const SKILL_VOCAB: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  java: "Java",
  "c++": "C++",
  "c#": "C#",
  go: "Go",
  rust: "Rust",
  swift: "Swift",
  kotlin: "Kotlin",
  react: "React",
  "next.js": "Next.js",
  "node.js": "Node.js",
  "node": "Node.js",
  html: "HTML",
  css: "CSS",
  tailwind: "Tailwind CSS",
  graphql: "GraphQL",
  sql: "SQL",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  supabase: "Supabase",
  mongodb: "MongoDB",
  redis: "Redis",
  prisma: "Prisma",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  aws: "AWS",
  azure: "Azure",
  "google cloud": "Google Cloud",
  docker: "Docker",
  kubernetes: "Kubernetes",
  terraform: "Terraform",
  git: "Git",
  "ci/cd": "CI/CD",
  jest: "Jest",
  vitest: "Vitest",
  playwright: "Playwright",
  cypress: "Cypress",
  pandas: "pandas",
  numpy: "NumPy",
  "scikit-learn": "scikit-learn",
  tensorflow: "TensorFlow",
  pytorch: "PyTorch",
  "machine learning": "Machine Learning",
  "data analysis": "Data Analysis",
  excel: "Excel",
  tableau: "Tableau",
  "power bi": "Power BI",
  figma: "Figma",
  agile: "Agile",
  rest: "REST APIs",
  "rest api": "REST APIs",
  "rest apis": "REST APIs",
  redux: "Redux",
  linux: "Linux",
  "system design": "System Design",
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Skills found in the text, in vocabulary order, no duplicates. */
export function extractSkills(text: string): string[] {
  const found: string[] = [];
  for (const [key, display] of Object.entries(SKILL_VOCAB)) {
    const re = new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(key)}(?![A-Za-z0-9+#])`, "i");
    if (re.test(text) && !found.includes(display)) found.push(display);
  }
  return found;
}

const TITLE_WORDS = [
  "software engineer", "software developer", "frontend", "front-end",
  "backend", "back-end", "full stack", "full-stack", "data analyst",
  "data scientist", "machine learning", "product manager", "ios engineer",
  "android engineer", "devops", "security engineer", "intern",
];

function extractTitles(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const t of TITLE_WORDS) {
    if (lower.includes(t)) {
      const display = t.replace(/\b\w/g, (c) => c.toUpperCase());
      if (!found.includes(display)) found.push(display);
    }
  }
  return found;
}

function extractEducation(text: string): string[] {
  const found: string[] = [];
  const re = /(B\.?\s*S\.?|B\.?\s*A\.?|M\.?\s*S\.?|Bachelor[^,\n]{0,40}|Master[^,\n]{0,40}|University[^,\n]{0,40}|College[^,\n]{0,40})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim().replace(/\s+/g, " ");
    if (s.length > 3 && !found.includes(s)) found.push(s);
    if (found.length >= 4) break;
  }
  return found;
}

/** Largest "N years" figure in the text, or null when none is stated. */
function extractYears(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:\+)?\s*years?/gi)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => parseFloat(m[1])));
}

/** Full parse of pasted or uploaded resume text. Pure, no I/O. */
export function parseResume(text: string): ParsedResume {
  const lines = text.split("\n");
  const bullets = lines.filter((l) => /^[\s]*[•\-*]\s+\S/.test(l));
  const quantified = bullets.filter((l) => /\d+\s*%|\d+x|\$\d|\d+\s*(users|ms|seconds|minutes|hours)/i.test(l));
  return {
    skills: extractSkills(text),
    yearsExperience: extractYears(text),
    titles: extractTitles(text),
    education: extractEducation(text),
    hasEmail: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text),
    hasPhone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4}/.test(text),
    hasLinks: /linkedin\.com|github\.com|https?:\/\//i.test(text),
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    bulletCount: bullets.length,
    quantifiedBullets: quantified.length,
  };
}

/** Skills each demo role leans on, keyed by words in the role title. */
const ROLE_SKILLS: { match: RegExp; skills: string[] }[] = [
  { match: /frontend|front-end/i, skills: ["React", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS"] },
  { match: /backend|back-end/i, skills: ["Node.js", "SQL", "PostgreSQL", "REST APIs", "Docker"] },
  { match: /full stack|full-stack/i, skills: ["React", "TypeScript", "Node.js", "SQL", "PostgreSQL", "Git"] },
  { match: /machine learning|ml |ai research|ai engineer/i, skills: ["Python", "PyTorch", "TensorFlow", "scikit-learn", "Machine Learning", "NumPy"] },
  { match: /data analyst/i, skills: ["SQL", "Python", "Excel", "Tableau", "Data Analysis"] },
  { match: /ios/i, skills: ["Swift", "Git"] },
  { match: /embedded/i, skills: ["C++", "Rust", "Linux"] },
  { match: /security/i, skills: ["Python", "Linux", "System Design"] },
  { match: /product manager/i, skills: ["Agile", "Data Analysis", "Excel", "Figma"] },
  { match: /software engineer|sde|software developer/i, skills: ["JavaScript", "TypeScript", "Python", "SQL", "Git", "REST APIs"] },
  { match: /cloud/i, skills: ["AWS", "Docker", "Linux", "Python"] },
  { match: /gameplay|game/i, skills: ["C++", "Git", "System Design"] },
];

/** Score the parsed resume against the demo roles, best first. */
export function matchDemoRoles(parsed: ParsedResume): RoleMatch[] {
  const apps = demoApplications();
  const seen = new Set<string>();
  const out: RoleMatch[] = [];
  for (const app of apps) {
    const key = `${app.company} ${app.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const want = ROLE_SKILLS.find((r) => r.match.test(app.role))?.skills ?? ["JavaScript", "Git"];
    const matched = want.filter((s) => parsed.skills.includes(s));
    const missing = want.filter((s) => !parsed.skills.includes(s));
    out.push({
      company: app.company,
      role: app.role,
      track: app.track,
      matched,
      missing,
      score: Math.round((matched.length / want.length) * 100),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
}

/** Concrete improvements: missing skills for the best matches, plus ATS tips. */
export function resumeTips(parsed: ParsedResume, matches: RoleMatch[]): ResumeTips {
  const missingSkills: string[] = [];
  for (const m of matches.slice(0, 3)) {
    for (const s of m.missing) {
      if (!missingSkills.includes(s)) missingSkills.push(s);
    }
  }
  const tips: string[] = [];
  if (!parsed.hasEmail) tips.push("Add an email address at the top so recruiters can reach you.");
  if (!parsed.hasPhone) tips.push("Add a phone number next to your email.");
  if (!parsed.hasLinks) tips.push("Add your LinkedIn and GitHub links so a reader can check your work in one click.");
  if (parsed.skills.length === 0) tips.push("Add a skills section listing the tools you actually use.");
  if (parsed.education.length === 0) tips.push("Add your education with school, degree, and graduation date.");
  if (parsed.wordCount > 0 && parsed.wordCount < 150) tips.push("This reads short for a resume. Add one or two projects with what you built and what it did.");
  if (parsed.wordCount > 900) tips.push("This runs long. Cut it to one page by keeping only the strongest bullets.");
  if (parsed.bulletCount > 0 && parsed.quantifiedBullets === 0) tips.push("Add numbers to your bullets. One result per bullet, like users reached or time saved.");
  if (parsed.bulletCount === 0 && parsed.wordCount > 0) tips.push("Use bullet points for experience and projects. Short lines scan faster than paragraphs.");
  if (parsed.yearsExperience === null && parsed.titles.length > 0) tips.push("State how long you did each role so the timeline is clear.");
  if (missingSkills.length > 0) {
    tips.push(`For your best matches, add or learn: ${missingSkills.slice(0, 5).join(", ")}. Only list skills you can actually use.`);
  }
  return { missingSkills: missingSkills.slice(0, 8), tips };
}

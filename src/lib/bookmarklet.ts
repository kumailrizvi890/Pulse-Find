/**
 * Bookmarklet (one-click save, interim step toward a browser extension).
 *
 * The bookmarklet is a `javascript:` URL the user drags to their
 * bookmarks bar. Clicking it on any job posting opens the site's /save
 * page with the current page's URL and title as query params, where the
 * draft below is prefilled for one-tap saving into the tracker.
 */
import { LIVE_APP_URL } from "./auth-redirect";

export interface DraftApplication {
  company: string;
  role: string;
  link: string;
}

/** The `javascript:` URL for the bookmarks bar, pointed at the live app. */
export function buildBookmarkletUrl(siteOrigin: string = LIVE_APP_URL): string {
  const js =
    `void(window.open(${JSON.stringify(`${siteOrigin}/save?u=`)}` +
    `+encodeURIComponent(location.href)+"&t="+encodeURIComponent(document.title),"_blank"))`;
  return `javascript:${encodeURIComponent(js)}`;
}

/** Two-part public suffixes where the registrable label sits one further left. */
const TWO_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.au",
  "co.jp",
  "co.in",
  "com.br",
]);

function titleCaseWord(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/**
 * Best-effort company guess from a page URL's host: the registrable
 * domain's first label, title-cased ("careers.stripe.com" -> "Stripe",
 * "boards.greenhouse.io" -> "Greenhouse"). It is a guess — the /save
 * page always lets the user correct it before saving.
 */
export function guessCompanyFromUrl(pageUrl: string): string {
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  let label: string;
  if (parts.length > 2 && TWO_PART_SUFFIXES.has(parts.slice(-2).join("."))) {
    label = parts[parts.length - 3];
  } else if (parts.length > 2) {
    label = parts[parts.length - 2];
  } else {
    label = parts[0];
  }
  return label
    .split("-")
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

const TITLE_SEPARATORS = /\s+(?:[-|·—–]|\bat\b)\s+/;

/**
 * Best-effort role guess from a page title: strip the company name,
 * then take the first chunk before a separator ("Software Engineer
 * Intern - Stripe" -> "Software Engineer Intern"). A guess only — the
 * /save page lets the user fix it.
 */
export function guessRoleFromTitle(pageTitle: string, company: string): string {
  let title = pageTitle.trim();
  if (company) {
    title = title.replace(new RegExp(escapeRegExp(company), "ig"), "").trim();
  }
  const first = title
    .split(TITLE_SEPARATORS)
    .map((s) =>
      s
        .replace(/^[-|·—–\s]+|[-|·—–\s]+$/g, "")
        .replace(/\s+at$/i, "")
        .trim(),
    )
    .find((s) => s.length > 0);
  return first ?? "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Turn a page URL + title into a draft application for the /save page. */
export function draftApplicationFromPage(pageUrl: string, pageTitle: string): DraftApplication {
  const company = guessCompanyFromUrl(pageUrl);
  return {
    company,
    role: guessRoleFromTitle(pageTitle, company),
    link: pageUrl,
  };
}

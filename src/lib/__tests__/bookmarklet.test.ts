import { describe, expect, it } from "vitest";
import {
  buildBookmarkletUrl,
  draftApplicationFromPage,
  guessCompanyFromUrl,
  guessRoleFromTitle,
} from "../bookmarklet";

describe("buildBookmarkletUrl", () => {
  it("builds a javascript: URL that opens the /save page with the page URL and title", () => {
    const url = buildBookmarkletUrl("https://pulsefind-app.vercel.app");
    expect(url.startsWith("javascript:")).toBe(true);
    const code = decodeURIComponent(url.slice("javascript:".length));
    expect(code).toContain("https://pulsefind-app.vercel.app/save?u=");
    expect(code).toContain("encodeURIComponent(location.href)");
    expect(code).toContain("encodeURIComponent(document.title)");
    expect(code).toContain('"_blank"');
  });

  it("defaults to the live app origin", () => {
    expect(buildBookmarkletUrl()).toContain("pulsefind-app.vercel.app");
  });
});

describe("guessCompanyFromUrl", () => {
  it("takes the registrable domain label, ignoring subdomains and www", () => {
    expect(guessCompanyFromUrl("https://careers.stripe.com/jobs/123")).toBe("Stripe");
    expect(guessCompanyFromUrl("https://www.google.com/about/careers/")).toBe("Google");
    expect(guessCompanyFromUrl("https://boards.greenhouse.io/acme/jobs/1")).toBe("Greenhouse");
    expect(guessCompanyFromUrl("https://jobs.lever.co/notion/abc")).toBe("Lever");
  });

  it("handles two-part suffixes and hyphenated names", () => {
    expect(guessCompanyFromUrl("https://careers.acme-labs.co.uk/jobs")).toBe("Acme Labs");
  });

  it("returns empty for a bad URL instead of throwing", () => {
    expect(guessCompanyFromUrl("not a url")).toBe("");
    expect(guessCompanyFromUrl("")).toBe("");
  });
});

describe("guessRoleFromTitle", () => {
  it("takes the chunk before the separator, with the company stripped", () => {
    expect(guessRoleFromTitle("Software Engineer Intern - Stripe", "Stripe")).toBe(
      "Software Engineer Intern",
    );
    expect(guessRoleFromTitle("Stripe | Product Manager", "Stripe")).toBe("Product Manager");
    expect(guessRoleFromTitle("Data Analyst at Notion", "Notion")).toBe("Data Analyst");
  });

  it("returns the whole title when there is no separator or company", () => {
    expect(guessRoleFromTitle("Backend Engineer", "")).toBe("Backend Engineer");
  });

  it("returns empty for a blank title", () => {
    expect(guessRoleFromTitle("", "")).toBe("");
  });
});

describe("draftApplicationFromPage", () => {
  it("guesses company and role and keeps the page URL as the link", () => {
    expect(
      draftApplicationFromPage(
        "https://careers.stripe.com/jobs/123",
        "Software Engineer Intern - Stripe",
      ),
    ).toEqual({
      company: "Stripe",
      role: "Software Engineer Intern",
      link: "https://careers.stripe.com/jobs/123",
    });
  });
});

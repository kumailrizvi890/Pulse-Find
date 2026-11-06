import { describe, expect, it } from "vitest";
import { boardUrl, normalizeBoard, trackOf } from "../../../supabase/functions/_shared/jobs";

describe("trackOf", () => {
  it.each([
    ["Software Engineer Intern, Summer 2027", "", "Internship"],
    ["SWE Co-op (Fall)", "", "Internship"],
    ["Software Engineer, New Grad 2027", "", "New Grad"],
    ["Associate Software Engineer", "", "New Grad"],
    ["Senior Software Engineer, Early Career Programs", "", "Other"], // senior beats the early-career wording
    ["Barista", "Part-time", "Part-Time"],
    ["Staff Engineer", "Full-time", "Full-Time"],
    ["Account Executive", "FullTime", "Full-Time"],
  ])("%s → %s", (title, commitment, expected) => expect(trackOf(title, commitment)).toBe(expected));
});

describe("normalizeBoard", () => {
  it("reads Greenhouse", () => {
    const raw = {
      jobs: [
        { id: 8172487, title: "Software Engineer Intern ", absolute_url: "https://stripe.com/jobs/search?gh_jid=8172487", location: { name: "Remote in US" }, first_published: "2026-09-03T13:30:34-04:00" },
        { id: 1, title: "", absolute_url: "https://x" }, // dropped: no title
        { id: 2, title: "Bad link", absolute_url: "javascript:alert(1)" }, // dropped: not https
      ],
    };
    const jobs = normalizeBoard({ source: "greenhouse", slug: "stripe", company: "Stripe" }, raw);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "greenhouse:stripe:8172487",
      company: "Stripe",
      title: "Software Engineer Intern",
      track: "Internship",
      tech: true,
      remote: true,
      posted_at: "2026-09-03T17:30:34.000Z",
    });
  });

  it("reads Lever", () => {
    const raw = [
      { id: "6ed7", text: "Forward Deployed Engineer, New Grad", hostedUrl: "https://jobs.lever.co/palantir/6ed7", createdAt: 1786469891368, workplaceType: "onsite", categories: { commitment: "Full-time", location: "New York, NY", allLocations: ["New York, NY", "Washington, D.C."] } },
    ];
    const [j] = normalizeBoard({ source: "lever", slug: "palantir", company: "Palantir" }, raw);
    expect(j).toMatchObject({ id: "lever:palantir:6ed7", track: "New Grad", tech: true, remote: false, location: "New York, NY · Washington, D.C." });
    expect(j.posted_at).toMatch(/^2026-08-/);
  });

  it("reads Ashby and skips unlisted jobs", () => {
    const raw = {
      jobs: [
        { id: "34413", title: " Security Engineer, Cloud", jobUrl: "https://jobs.ashbyhq.com/ramp/34413", location: "New York, NY (HQ)", isRemote: true, employmentType: "FullTime", publishedAt: "2026-04-07T17:12:35.753+00:00", isListed: true },
        { id: "hidden", title: "Secret role", jobUrl: "https://jobs.ashbyhq.com/ramp/hidden", isListed: false },
      ],
    };
    const jobs = normalizeBoard({ source: "ashby", slug: "ramp", company: "Ramp" }, raw);
    expect(jobs.map((j) => j.id)).toEqual(["ashby:ramp:34413"]);
    expect(jobs[0]).toMatchObject({ title: "Security Engineer, Cloud", remote: true, track: "Full-Time", tech: true });
  });

  it("survives junk responses", () => {
    expect(normalizeBoard({ source: "greenhouse", slug: "x", company: "X" }, null)).toEqual([]);
    expect(normalizeBoard({ source: "lever", slug: "x", company: "X" }, { error: "nope" })).toEqual([]);
    expect(normalizeBoard({ source: "ashby", slug: "x", company: "X" }, "<html>")).toEqual([]);
  });

  it("builds the public board URLs", () => {
    expect(boardUrl({ source: "lever", slug: "plaid", company: "Plaid" })).toBe("https://api.lever.co/v0/postings/plaid?mode=json");
  });
});

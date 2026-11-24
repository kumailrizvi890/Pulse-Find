import { describe, expect, it } from "vitest";
import { isAdvancedDegreeOnly, orderSwipeQueue } from "@/lib/job-picks";

// Swipe order (Nov 24 2026): the first swipe card used to be a
// PhD-only Waymo role, an odd first impression for an undergrad
// audience. Undergrad-eligible roles come first; PhD/MS-only roles
// move to the back, in their posted order, never removed.

const pick = (title: string, company = "Acme") => ({
  id: `${company}-${title}`,
  company,
  title,
  location: "Seattle, WA",
  remote: false,
  url: "https://example.com/jobs/1",
  track: "Internship",
  tech: true,
  posted_at: null,
});

describe("isAdvancedDegreeOnly", () => {
  it("flags PhD, MSc, Master's, and doctoral titles", () => {
    for (const title of [
      "2027 Summer Intern, PhD, Agentic AI",
      "Research Intern, PhD",
      "Software Engineer Intern, MSc",
      "ML Engineer, Master's",
      "Doctoral Researcher, Summer 2027",
    ]) {
      expect(isAdvancedDegreeOnly(title)).toBe(true);
    }
  });

  it("does not flag plain undergrad or new-grad titles", () => {
    for (const title of [
      "Software Engineer Intern, Summer 2027",
      "Graduate Engineer, Class of 2027",
      "New Grad Software Engineer",
      "SWE Intern, Summer 2027",
    ]) {
      expect(isAdvancedDegreeOnly(title)).toBe(false);
    }
  });

  it("does not match 'graduate' — UK 'Graduate Engineer' means new grad", () => {
    expect(isAdvancedDegreeOnly("Graduate Software Engineer")).toBe(false);
    expect(isAdvancedDegreeOnly("Graduate Engineer, Class of 2027")).toBe(false);
  });
});

describe("orderSwipeQueue", () => {
  it("puts undergrad-eligible roles first, advanced-degree roles after, in posted order", () => {
    const queue = orderSwipeQueue([
      pick("2027 Summer Intern, PhD, Agentic AI", "Waymo"),
      pick("Software Engineer Intern, Summer 2027", "Acme"),
      pick("ML Engineer, Master's", "Beta"),
      pick("SWE Intern, Summer 2027", "Gamma"),
    ]);
    expect(queue.map((p) => p.title)).toEqual([
      "Software Engineer Intern, Summer 2027",
      "SWE Intern, Summer 2027",
      "2027 Summer Intern, PhD, Agentic AI",
      "ML Engineer, Master's",
    ]);
  });

  it("keeps every role: nothing is dropped", () => {
    const input = [
      pick("2027 Summer Intern, PhD, Agentic AI", "Waymo"),
      pick("Software Engineer Intern, Summer 2027", "Acme"),
    ];
    expect(orderSwipeQueue(input)).toHaveLength(2);
  });

  it("leaves an all-undergrad queue in posted order", () => {
    const input = [
      pick("Software Engineer Intern, Summer 2027", "Acme"),
      pick("SWE Intern, Summer 2027", "Gamma"),
    ];
    expect(orderSwipeQueue(input).map((p) => p.company)).toEqual(["Acme", "Gamma"]);
  });

  it("leaves an all-advanced queue in posted order", () => {
    const input = [
      pick("Research Intern, PhD", "Waymo"),
      pick("ML Engineer, Master's", "Beta"),
    ];
    expect(orderSwipeQueue(input).map((p) => p.company)).toEqual(["Waymo", "Beta"]);
  });
});

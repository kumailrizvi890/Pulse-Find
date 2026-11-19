import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { demoPipelineStore, isExternalUrl } from "../pipeline";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const networking = read("components/pipeline/NetworkingSection.tsx");
const leadsSection = read("components/pipeline/LeadsSection.tsx");

/**
 * Loop pass 47 — the two decisions Kumail made in the main chat on
 * Wed Nov 18, 2026, plus the Company-placeholder transcription nit
 * pass 46 left behind:
 * (A) the six demo seed leads carry fictional career-page URLs, so the
 *     "Open posting" button shows on every lead (dead links on click —
 *     the companies are invented, the pages do not exist);
 * (B) the landing pace counts the same rolling last 7 days as the
 *     dashboard's 7-day chart, not the Mon-Sun calendar week (pinned
 *     in landing-sections.test.ts and hero-utc-today.test.ts).
 */
describe("demo seed leads carry fictional career-page URLs (option A)", () => {
  it("every seed lead has an https careers URL for its own company", async () => {
    const store = demoPipelineStore("2026-11-18");
    const seeds = (await store.loadLeads()).filter((l) => l.id.startsWith("demo-lead-"));
    expect(seeds).toHaveLength(6);
    expect(seeds.map((l) => l.url)).toEqual([
      "https://westfieldlabs.com/careers/software-engineer-intern",
      "https://copperline.com/careers/machine-learning-intern",
      "https://brightwaterhealth.com/careers/frontend-engineer-new-grad",
      "https://atlasrobotics.com/careers/software-intern-perception",
      "https://fernhillcapital.com/careers/quant-developer-intern",
      "https://tidewatercloud.com/careers/sre-intern",
    ]);
    for (const l of seeds) expect(isExternalUrl(l.url)).toBe(true);
  });

  it("the leads list only gates Open posting on a non-empty URL", () => {
    // With every seed carrying a URL, the button now shows on all of
    // them; a lead with no URL still shows no dead button.
    expect(leadsSection).toContain("{l.url && (");
    expect(leadsSection).toContain("Open posting");
  });
});

describe("add-person Company field has no borrowed Status placeholder", () => {
  it("the Company input carries no placeholder; the Status example stays", () => {
    // Pass 46 transcribed the Status field's example placeholder onto
    // the Company input. The Company field takes a plain company name,
    // so it gets no example text; the Status example is the only
    // "Connected — thanked" left in the form.
    const companyInput = networking.match(/Company\s*\n\s*<input[^/]*\/>/);
    expect(companyInput).not.toBeNull();
    expect(companyInput![0]).not.toContain("placeholder");
    expect(networking.split("Connected — thanked").length - 1).toBe(1);
  });
});

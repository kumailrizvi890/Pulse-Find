import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Loop pass 54 — audit findings #9 (leads dead ends, remainder) and #11
// (landing video). All four sub-issues were reproduced in code before
// fixing; #11c (stale stats inside the recorded video itself) is not
// fixable in code and is deliberately NOT changed here — it needs a
// re-record, which is Kumail's call (noted in DEPLOY.md).
//
// #9a — two overlapping "I applied" paths on the leads page. The
// "I applied - track it" button created the tracker application, but
// the status dropdown's "Applied" pick only flipped the lead's status:
// the row then read "In tracker" with no application in the tracker,
// and the promote button was gone (canPromoteLead blocks Applied), so
// the lead was stuck. The edit form's status pick had the same hole.
// Now every "Applied" choice lands in markApplied(): promote, unless
// the application is already tracked, in which case the flip alone is
// the truth.
// #9b — truncated locations on leads. The role, location, pay and source
// line was one truncated line, so long locations read mid-word
// ("Washington, Distric…"). The line wraps now, so the full location
// reads. (The two example strings live in real tracker data, not in
// the repo; the truncation mechanism was confirmed in code.)
// #11a — the landing video had no controls: it autoplays muted and
// loops, but a visitor could not pause, scrub or replay it. It now has
// native controls; autoplay, muted, loop and playsInline are unchanged.
// #11b — the pace chart's trend arrows were the ↗ / ↘ characters, which
// render as empty boxes in some browsers and fonts. They are inline SVG
// arrows now, drawn with currentColor so they follow the good / danger
// text color, with a screen-reader-only "up" / "down".

function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

describe("finding #9a: one path to Applied on the leads page", () => {
  const section = read("components/pipeline/LeadsSection.tsx");

  it("routes the status dropdown through changeStatus, not straight to setStatus", () => {
    expect(section).toContain("onChange={(e) => changeStatus(l, e.target.value as LeadStatus)}");
    expect(section).not.toContain("onChange={(e) => setStatus(l, e.target.value as LeadStatus)}");
  });

  it("changeStatus sends an Applied pick to markApplied and everything else to setStatus", () => {
    const start = section.indexOf("async function changeStatus");
    const end = section.indexOf("async function promote");
    const fn = section.slice(start, end);
    expect(fn).toContain('if (status === "Applied" && l.status !== "Applied") {');
    expect(fn).toContain("await markApplied(l);");
    expect(fn).toContain("await setStatus(l, status);");
  });

  it("markApplied promotes, unless the application is already tracked", () => {
    const start = section.indexOf("async function markApplied");
    const end = section.indexOf("async function changeStatus");
    const fn = section.slice(start, end);
    expect(fn).toContain("if (isAlreadyTracked(trackedApps, l)) {");
    expect(fn).toContain('await setStatus(l, "Applied");');
    expect(fn).toContain("await promote(l);");
  });

  it("the promote button is still the only button and still says I applied - track it", () => {
    expect(section).toContain("I applied - track it");
    expect(section).toContain("canPromoteLead(l, trackedApps) ? (");
    expect(section).toContain("onClick={() => promote(l)}");
  });

  it("the edit form saves field edits first, then marks the saved lead Applied", () => {
    const start = section.indexOf("async function save");
    const end = section.indexOf("async function remove");
    const fn = section.slice(start, end);
    expect(fn).toContain('const flippingToApplied = input.status === "Applied" && form.editing.status !== "Applied";');
    expect(fn).toContain("const toSave = flippingToApplied ? { ...input, status: form.editing.status } : input;");
    expect(fn).toContain("await markApplied(next);");
    // No direct Applied save: the flip never persists status Applied on its own.
    expect(fn).not.toContain("pipeline.updateLead(form.editing.id, input)");
  });

  it("a brand-new lead saved as Applied is created as New, then marked Applied", () => {
    const start = section.indexOf("async function save");
    const end = section.indexOf("async function remove");
    const fn = section.slice(start, end);
    expect(fn).toContain('const toCreate = input.status === "Applied" ? { ...input, status: "New" as const } : input;');
    expect(fn).toContain("await markApplied(made);");
  });

  it("the new Applied-path code uses a hyphen, not an em dash, in its comments", () => {
    const start = section.indexOf("async function markApplied");
    const end = section.indexOf("async function save");
    const fns = section.slice(start, end);
    expect(fns).not.toContain("—");
  });
});

describe("finding #9b: lead locations are not truncated", () => {
  const section = read("components/pipeline/LeadsSection.tsx");

  it("the role, location, pay and source line no longer truncates", () => {
    expect(section).not.toContain("mt-0.5 truncate");
    expect(section).toContain('<p className="mt-0.5 text-sm text-muted">');
  });

  it("the line still shows the role, location, pay and source", () => {
    expect(section).toContain('{l.role || "Role not set"}');
    expect(section).toContain("{l.location && <> · {l.location}</>}");
    expect(section).toContain("{l.pay && <> · {l.pay}</>}");
    expect(section).toContain("{l.source && <> · via {l.source}</>}");
  });
});

describe("finding #11a: the landing video has controls", () => {
  const home = read("app/page.tsx");
  const video = home.slice(home.indexOf("<video"), home.indexOf("/>", home.indexOf("<video")));

  it("offers native controls while keeping autoplay muted, looping and inline", () => {
    expect(video).toContain("controls");
    expect(video).toContain("autoPlay");
    expect(video).toContain("muted");
    expect(video).toContain("loop");
    expect(video).toContain("playsInline");
    expect(video).toContain('src="/landing/demo-tour.mp4"');
    expect(video).toContain('poster="/landing/demo-tour-poster.jpg"');
  });
});

describe("finding #11b: trend arrows are inline SVG, not glyphs", () => {  const charts = read("components/dashboard/Charts.tsx");

  it("has no boxed-glyph trend arrows left in the pace chart", () => {
    expect(charts).not.toContain("↗");
    expect(charts).not.toContain("↘");
  });

  it("draws the up and down arrows as currentColor SVG paths", () => {
    expect(charts).toContain("M2.5 9.5 L9.5 2.5 M4.5 2.5 H9.5 V7.5");
    expect(charts).toContain("M2.5 2.5 L9.5 9.5 M4.5 9.5 H9.5 V4.5");
    expect(charts).toContain('stroke="currentColor"');
    expect(charts).toContain('aria-hidden="true"');
  });

  it("still reads the change as text, with a screen-reader-only direction", () => {
    expect(charts).toContain("{Math.abs(change)}% vs {prevLabel}");
    expect(charts).toContain('className="sr-only"');
    expect(charts).toContain('{change >= 0 ? "up " : "down "}');
  });
});

describe("optional nit: the public nav fits on one line at 430px", () => {
  const topBar = read("components/TopBar.tsx");
  const logo = read("components/Logo.tsx");

  it("tightens the link padding below sm and never wraps a nav item", () => {
    // The public nav measured about 396px against 398px of room at
    // 430px, so a 1-2px squeeze wrapped "Sign in" and "Pulse Find"
    // onto two lines. 2px tighter per link below sm frees ~20px.
    expect(topBar).toContain("whitespace-nowrap rounded-lg px-2 py-1.5");
    expect(topBar).toContain("sm:px-2.5");
    expect(topBar).toContain("whitespace-nowrap rounded-lg bg-accent px-3 py-1.5");
    expect(topBar).toContain("sm:px-3.5");
    expect(topBar).toContain('className="flex shrink-0 items-center gap-1 text-sm"');
    expect(logo).toContain("whitespace-nowrap font-display");
  });

  it("keeps the desktop padding and the GitHub link hidden below sm", () => {
    const home = read("app/page.tsx");
    expect(home).toContain('<span className="hidden sm:inline">');
    expect(topBar).toContain("px-2.5");
    expect(topBar).toContain("px-3.5");
  });
});

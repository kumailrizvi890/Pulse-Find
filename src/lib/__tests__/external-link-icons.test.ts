import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// External-link affordance as an inline SVG (Nov 19, 2026).
//
// The literal ↗ character (U+2197) marked the "Apply Now" / "View
// posting" links and the chat link pills, but it lives in the Arrows
// block, which Geist does not cover, so on minimal font setups (the cloud
// browser among them) it rendered as a missing-glyph box. Every
// user-facing link that opens a new tab now carries the same small
// arrow-up-right SVG from src/components/icons.tsx instead, drawn in
// currentColor so each link keeps its existing colour — including the
// networking name link, which turns text-danger when overdue.
//
// Scope note: the jobs-board job-title link is deliberately left
// icon-free. It is a headline-style link, and the same row already has
// an icon'd "Open posting" button; an arrow after every title would
// clutter the list. Everything else that opens a new tab carries the
// icon, including the landing "Self host" buttons, the footer links and
// the top-bar GitHub link.
const src = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", "..", ...parts), "utf8");

const icons = src("components", "icons.tsx");
const details = src("app", "jobs", "JobDetails.tsx");
const board = src("app", "jobs", "JobsBoard.tsx");
const deck = src("app", "jobs", "SwipeDeck.tsx");
const chat = src("components", "dashboard", "TaskChatPanel.tsx");
const networking = src("components", "pipeline", "NetworkingSection.tsx");
const leads = src("components", "pipeline", "LeadsSection.tsx");
const openings = src("components", "dashboard", "NewOpenings.tsx");
const home = src("app", "page.tsx");
const footer = src("components", "SiteFooter.tsx");
const topBar = src("components", "TopBar.tsx");

describe("no ↗ literal left where a link opens a new tab", () => {
  it("has no ↗ in the job details, board, deck or chat panel", () => {
    expect(details).not.toContain("↗");
    expect(board).not.toContain("↗");
    expect(deck).not.toContain("↗");
    expect(chat).not.toContain("↗");
  });
});

describe("the shared external-link icon", () => {
  it("exports IconExternalLink as a Feather arrow-up-right", () => {
    expect(icons).toContain("export function IconExternalLink");
    expect(icons).toContain('<line x1="7" y1="17" x2="17" y2="7" />');
    expect(icons).toContain('<polyline points="7 7 17 7 17 17" />');
  });

  it("draws in currentColor, hides from assistive tech, and carries a test id", () => {
    expect(icons).toContain('stroke="currentColor"');
    expect(icons).toContain('aria-hidden="true"');
    expect(icons).toContain('testId="external-link-icon"');
  });
});

describe("the ↗ links now render the icon", () => {
  it("job details Apply Now keeps its label and gains the arrow", () => {
    expect(details).toContain('Apply Now <IconExternalLink className="h-4 w-4 shrink-0" />');
  });

  it("saved-list View posting keeps its label and gains the arrow", () => {
    expect(board).toContain('View posting <IconExternalLink className="h-3 w-3 shrink-0" />');
  });

  it("swipe-deck View posting keeps its label and gains the arrow", () => {
    expect(deck).toContain('View posting <IconExternalLink className="h-3 w-3 shrink-0" />');
  });

  it("chat link pills keep their label and gain the arrow", () => {
    expect(chat).toContain('{l.label} <IconExternalLink className="h-3 w-3 shrink-0" />');
  });
});

describe("links that had no affordance now carry the icon", () => {
  it("networking LinkedIn name link shows the arrow after the name", () => {
    expect(networking).toContain('{c.person_name} <IconExternalLink className="h-3 w-3 shrink-0" />');
  });

  it("networking name link keeps its target, rel and overdue styling", () => {
    expect(networking).toContain('target="_blank" rel="noreferrer"');
    expect(networking).toContain('bucket === "overdue" && "text-danger"');
  });

  it("leads Open posting gains the arrow", () => {
    expect(leads).toContain('Open posting <IconExternalLink className="h-3.5 w-3.5 shrink-0" />');
  });

  it("jobs-board list Open posting gains the arrow", () => {
    expect(board).toContain('Open posting <IconExternalLink className="h-3.5 w-3.5 shrink-0" />');
  });

  it("dashboard new-openings Open gains the arrow", () => {
    expect(openings).toContain('Open <IconExternalLink className="h-3.5 w-3.5 shrink-0" />');
  });

  it("landing Self host buttons gain the arrow", () => {
    expect(home).toContain('Self host <IconExternalLink className="h-4 w-4 shrink-0" />');
    expect(home).toContain('Self-host it <IconExternalLink className="h-4 w-4 shrink-0" />');
  });

  it("footer portfolio and GitHub links gain the arrow", () => {
    expect(footer).toContain('Kumail Rizvi <IconExternalLink className="h-3 w-3 shrink-0" />');
    expect(footer).toContain('GitHub <IconExternalLink className="h-3 w-3 shrink-0" />');
  });

  it("top-bar GitHub link gains the arrow", () => {
    expect(topBar).toContain('GitHub <IconExternalLink className="h-3 w-3 shrink-0" />');
  });
});

describe("every changed file uses the shared icon", () => {
  it("imports IconExternalLink from the shared icons module", () => {
    for (const file of [details, board, deck, chat, networking, leads, openings, home]) {
      expect(file).toContain("IconExternalLink");
      expect(file).toContain('from "@/components/icons"');
    }
    for (const file of [footer, topBar]) {
      expect(file).toContain("IconExternalLink");
      expect(file).toContain('from "./icons"');
    }
  });

  it("leaves the jobs-board job-title link icon-free by design", () => {
    expect(board).not.toContain("{j.title} <IconExternalLink");
  });
});

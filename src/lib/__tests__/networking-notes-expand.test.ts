import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactNote } from "../../components/pipeline/NetworkingSection";

// Audit gap #8: a contact note rendered with a bare `truncate` class and
// no way to read the rest. Notes can run to 2000 characters, so anything
// past one line was unreadable without opening the edit form. Long notes
// now get a Show more toggle that expands in place; short notes render
// in full with no toggle.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const networking = read("components/pipeline/NetworkingSection.tsx");

const SHORT_NOTE = "Recruiter, university programs";
const LONG_NOTE =
  "Met at the UW Bothell career fair in October. She runs university recruiting for the perception team and asked for a portfolio link plus one project write-up before the next round.";

describe("contact notes expand in place", () => {
  it("renders a short note in full with no toggle", () => {
    const html = renderToStaticMarkup(createElement(ContactNote, { note: SHORT_NOTE }));
    expect(html).toContain(SHORT_NOTE);
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("truncate");
  });

  it("truncates a long note and offers a Show more toggle", () => {
    const html = renderToStaticMarkup(createElement(ContactNote, { note: LONG_NOTE }));
    expect(html).toContain(LONG_NOTE);
    expect(html).toContain("truncate");
    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
  });

  it("toggles back: the expanded state shows Show less and wraps instead of truncating", () => {
    expect(networking).toContain('onClick={() => setExpanded((v) => !v)}');
    expect(networking).toContain('{expanded ? "Show less" : "Show more"}');
    expect(networking).toContain('aria-expanded={expanded}');
    expect(networking).toContain('expanded ? "break-words" : "truncate"');
  });

  it("only offers the toggle past the preview limit", () => {
    expect(networking).toContain("const NOTE_PREVIEW_LIMIT = 80;");
    expect(networking).toContain("if (note.length <= NOTE_PREVIEW_LIMIT) {");
  });

  it("uses the expandable note in the contact row, not the bare truncated line", () => {
    expect(networking).toContain("{c.notes && <ContactNote note={c.notes} />}");
    expect(networking).not.toContain('<p className="mt-0.5 truncate text-xs text-faint">{c.notes}</p>');
  });

  it("keeps the added copy free of em dashes", () => {
    const start = networking.indexOf("const NOTE_PREVIEW_LIMIT");
    const end = networking.indexOf("function contactInputOf");
    const added = networking.slice(start, end);
    expect(added).not.toContain("—");
  });
});

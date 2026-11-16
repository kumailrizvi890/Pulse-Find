import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The list-view Save button toasted "Saved", but every swipe-deck action
// was silent: swiping right, tapping the deck's Save/Pass buttons, using
// the arrow keys, undoing, and removing a saved role all updated state
// with no toast, so a visitor could not tell the tap had done anything.
// The deck is the default view, so this was the path most people hit.
// Pin the toasts on every jobs-board action.
const src = readFileSync(
  join(__dirname, "..", "..", "app", "jobs", "JobsBoard.tsx"),
  "utf8",
);

function fnBody(name: string, nextMarker: string): string {
  const start = src.indexOf(`async function ${name}(`);
  if (start === -1) throw new Error(`no ${name} function found in JobsBoard.tsx`);
  const end = src.indexOf(nextMarker, start);
  return src.slice(start, end === -1 ? undefined : end);
}

describe("jobs board toasts", () => {
  it("toasts on swipe save and swipe pass, with the same words as the list buttons", () => {
    const swipe = fnBody("swipe", "async function undo(");
    expect(swipe).toContain('toast(choice === "saved" ? "Saved" : "Hidden")');
  });

  it("toasts only when the swipe actually sticks", () => {
    const swipe = fnBody("swipe", "async function undo(");
    // the toast sits inside the setMark success branch, not after it
    expect(swipe).toMatch(/if \(await setMark\(job, choice\)\) \{[\s\S]*toast\(choice/);
  });

  it("toasts when an undo restores a card", () => {
    const undo = fnBody("undo", "async function removeSaved(");
    expect(undo).toContain('toast("Undone")');
  });

  it("toasts when a saved role is removed from the saved list", () => {
    const remove = fnBody("removeSaved", "function changeView(");
    expect(remove).toContain('toast("Removed")');
    expect(src).toContain("onClick={() => removeSaved(j)}");
  });

  it("keeps the list-view toasts (Save / Hide / Applied) as they were", () => {
    const mark = fnBody("mark", "async function swipe(");
    expect(mark).toContain('toast(next === "saved" ? "Saved" : "Hidden")');
    expect(src).toContain('toast(`Added ${job.company} to your tracker`)');
  });

  it("still renders the toast node on the page", () => {
    expect(src).toContain("{toastNode}");
    expect(src).toContain("const { toast, toastNode } = useToast();");
  });
});

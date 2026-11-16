import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The .rise entrance animation sits on the <main> of the dashboard, sheet,
// leads, networking and jobs pages, and every fixed dialog and toast on
// those pages renders inside it. If the animation leaves a transform
// behind (fill mode "both" keeps the "to" keyframe's translateY(0),
// which still counts as a transform), the main becomes the containing
// block for fixed descendants and the dialogs anchor to the top of the
// page instead of the viewport — opening off-screen once the user has
// scrolled. Pin the fill mode so that footgun cannot come back silently.
const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

function riseRule(): string {
  const m = css.match(/\.rise\s*\{[^}]*\}/);
  if (!m) throw new Error("no .rise rule found in globals.css");
  return m[0];
}

describe("rise entrance animation", () => {
  it("does not keep a transform after the animation (fill backwards, not both)", () => {
    const rule = riseRule();
    expect(rule).toContain("backwards");
    expect(rule).not.toContain("both");
  });

  it("ends at the natural state, so dropping the forwards fill changes nothing visually", () => {
    const keyframes = css.match(/@keyframes rise-in\s*\{[\s\S]*?\n\}/);
    expect(keyframes).not.toBeNull();
    expect(keyframes![0]).toContain("to { opacity: 1; transform: translateY(0); }");
  });
});

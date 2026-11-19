"use client";

import { OPEN_TOUR_EVENT } from "@/lib/tour-window";

// The About page's "Replay the tour" button: reopens the tour window
// at step 1 from the landing page (same event the demo nav's Take the
// tour button dispatches).
export function ReplayTourButton() {
  return (
    <button
      className="cta2 ghost"
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT))}
    >
      Replay the tour
    </button>
  );
}

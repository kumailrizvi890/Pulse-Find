/**
 * The Pulse Find ECG trace: an animated heartbeat line used as the brand motif
 * in the redesign shell (signed-in pages, auth) and the landing hero.
 * Decorative only; respects reduced-motion via the global CSS rule.
 *
 * v2 (Nov 15 2026): the trace is neon now, like the reference — a wide
 * low-opacity halo stroke, a mid stroke, and a bright white core that
 * draws itself. Same three-spike geometry; only the rendering changed.
 *
 * Heartbeat (Nov 16 2026): the core still draws itself once on load, and
 * a glowing head now travels the line in a double beat (lub-dub) on a
 * slow loop, while the halo thumps twice in time with it. The line is
 * never hidden: the fully drawn base is always there, the head is a
 * short bright segment on top of it. Reduced motion hides the head and
 * shows the line fully drawn (see globals.css).
 */
export function PulseTrace({ className = "h-6 w-full", glow = true }: { className?: string; glow?: boolean }) {
  const d =
    "M0 22 H150 l10 -12 14 26 10 -20 6 6 H300 l10 -12 14 26 10 -20 6 6 H450 l10 -12 14 26 10 -20 6 6 H600";
  return (
    <svg viewBox="0 0 600 40" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      {glow && (
        <g className="pf-ecg-halo">
          <path
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.4"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.65"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      <path
        d={d}
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={120}
        className="pulse-trace"
      />
      {glow && (
        <path
          d={d}
          fill="none"
          stroke="var(--accent-ink)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={120}
          className="pf-ecg-head"
        />
      )}
    </svg>
  );
}

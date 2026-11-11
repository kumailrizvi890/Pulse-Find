/**
 * The Pulse Find ECG trace: an animated heartbeat line used as the brand motif
 * in the redesign shell (signed-in pages, auth) and the landing hero.
 * Decorative only; respects reduced-motion via the global CSS rule.
 */
export function PulseTrace({ className = "h-6 w-full", glow = true }: { className?: string; glow?: boolean }) {
  return (
    <svg viewBox="0 0 600 40" preserveAspectRatio="none" className={className} aria-hidden="true" focusable="false">
      {glow && (
        <path
          d="M0 22 H150 l10 -12 14 26 10 -20 6 6 H300 l10 -12 14 26 10 -20 6 6 H450 l10 -12 14 26 10 -20 6 6 H600"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.25"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d="M0 22 H150 l10 -12 14 26 10 -20 6 6 H300 l10 -12 14 26 10 -20 6 6 H450 l10 -12 14 26 10 -20 6 6 H600"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={120}
        className="pulse-trace"
      />
    </svg>
  );
}

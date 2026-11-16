import { cx } from "@/components/dashboard/ui";

/**
 * The PULSE brand marks: one shared heartbeat waveform, the animated
 * status dot, and the heartbeat loader. Everything here uses only the
 * existing tokens (var(--accent) / var(--accent-soft)) — no new colors.
 * The waveform shape is the tall-spike ECG from the brand references:
 * a flat baseline, a small rise, one tall spike, one deep dip, back to
 * the baseline. All animation is CSS; the global reduced-motion rule in
 * globals.css collapses it.
 */

/** Single-spike red ECG line, transparent background. */
export function PulseWaveform({
  className,
  glow = true,
}: {
  className?: string;
  glow?: boolean;
}) {
  const d = "M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120";
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="xMidYMid meet" className={className} aria-hidden="true" focusable="false">
      {glow && (
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.25"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tiny animated red status dot: a glowing center with an expanding ring,
 * per the brand reference (concentric rings, glowing red center). Put it
 * beside live statuses, AI activity, and notifications — never next to
 * an existing red tag for the same thing.
 */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cx("pf-dot", className)} aria-hidden="true" />;
}

/** Minimal red heartbeat loader: the waveform drawing itself, on a loop. */
export function PulseHeartbeat({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center gap-2", className)} role="status" aria-label={label}>
      <svg viewBox="0 0 120 40" className="h-8 w-28" aria-hidden="true" focusable="false">
        <path
          d="M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.25"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={120}
          className="pf-heartbeat-line"
        />
      </svg>
    </div>
  );
}

/** The one-line branded touch for empty states. */
export function WaitingSignal({ className }: { className?: string }) {
  return (
    <p className={cx("flex items-center gap-2 text-xs text-faint", className)}>
      <PulseWaveform className="h-3 w-10 shrink-0" glow={false} />
      Waiting for your next signal.
    </p>
  );
}

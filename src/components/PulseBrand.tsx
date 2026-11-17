import { useId } from "react";

/** Local class joiner — deliberately NOT imported from dashboard/ui, which
 * is a "use client" module: PulseBrand is also rendered from server
 * components (the landing hero), and calling a client-module function
 * from the server fails the prerender. */
function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/**
 * The PULSE brand marks: one shared heartbeat waveform, the animated
 * status dot, the heartbeat loader, and the notification bell. Everything
 * here uses only the existing tokens (var(--accent) / var(--accent-soft)
 * / var(--accent-ink)) — no new colors. The waveform shape is the
 * tall-spike ECG from the brand references: a flat baseline, a small
 * rise, one tall spike, one deep dip, back to the baseline. v2 renders
 * it as neon, like the reference image: a wide low-opacity halo stroke,
 * a mid stroke, and a bright white core. All animation is CSS; the
 * global reduced-motion rule in globals.css collapses it.
 */

/** Single-spike red ECG line, transparent background, neon when glowing. */
export function PulseWaveform({
  className,
  glow = true,
}: {
  className?: string;
  glow?: boolean;
}) {
  const d = "M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120";
  return (
    <svg viewBox="0 0 120 40" preserveAspectRatio="xMidYMid meet" className={cx(glow && "pf-wave-glow", className)} aria-hidden="true" focusable="false">
      {glow && (
        <>
          <path
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.35"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.7"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      <path
        d={d}
        fill="none"
        stroke={glow ? "var(--accent-ink)" : "var(--accent)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Animated red status dot: a glowing center with an expanding ring,
 * per the brand reference (concentric rings, glowing red center). v2:
 * bigger (10px) with a stronger ring, so it reads at a glance. Put it
 * beside live statuses, AI activity, and notifications — never next to
 * an existing red tag for the same thing.
 */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cx("pf-dot", className)} aria-hidden="true" />;
}

/** Neon heartbeat loader: the waveform drawing itself, on a loop. */
export function PulseHeartbeat({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center gap-2", className)} role="status" aria-label={label}>
      <svg viewBox="0 0 120 40" className="pf-wave-glow h-10 w-32" aria-hidden="true" focusable="false">
        <path
          d="M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.35"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.7"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0 22 H34 L38 15 L42 29 L46 9 L50 35 L54 17 L58 22 H120"
          fill="none"
          stroke="var(--accent-ink)"
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

/**
 * The notification sign (v2): a red bell with a glowing red count
 * badge, per the bell reference. The v1 pill was too easy to miss —
 * this one is unmissable. Used on the "Waiting on you" panel, with
 * the pulsing dot beside it.
 */
export function NotifyBell({ count, overdue }: { count: number; overdue?: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="pf-bell" role="img" aria-label={`${count} things waiting on you`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
          <path
            d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
            fill="var(--accent)"
          />
        </svg>
        <span className="pf-bell-count">{count}</span>
      </span>
      {overdue ? <span className="text-xs font-semibold text-danger">{overdue} overdue</span> : null}
    </span>
  );
}

/** The one-line branded touch for empty states. */
export function WaitingSignal({ className }: { className?: string }) {
  return (
    <p className={cx("flex items-center gap-2 text-xs text-faint", className)}>
      <PulseWaveform className="h-3.5 w-12 shrink-0" glow />
      Waiting for your next signal.
    </p>
  );
}

/**
 * Pulse's mark: a small red crystal, gently glowing. One shared mark for
 * the chat header, the message avatars, and the floating assistant
 * button, so the crystal reads the same everywhere. The glow pulse is
 * the pf-pulse-crystal animation, defined beside the chat panel styles.
 */
export function PulseCrystal({ className }: { className?: string }) {
  const rawId = useId();
  const gradId = `pf-crystal-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cx("pf-pulse-crystal shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="55%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <polygon points="24,3 39,13 39,29 24,45 9,29 9,13" fill={`url(#${gradId})`} />
      <polyline points="9,13 24,19 39,13" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1" />
      <polyline points="24,3 24,19 24,45" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" />
      <polyline points="9,29 24,19 39,29" fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1" />
      <polygon points="24,3 39,13 24,19 9,13" fill="#ffffff" fillOpacity="0.18" />
    </svg>
  );
}

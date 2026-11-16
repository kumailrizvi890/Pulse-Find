import Link from "next/link";

// The PULSE mark, unboxed (v2, Nov 15 2026): the bare tall-spike
// heartbeat from the neon reference — no red tile behind it. It renders
// as a neon line: a wide low-opacity halo stroke, a mid stroke, and a
// bright white core, plus a CSS drop-shadow glow (.pf-mark). Same
// tall-spike path shape as v1; only the box is gone.
const MARK_PATH = "M4 17 H9 L11 12 L14.5 22 L17 5 L19.5 27 L21 14 L22.5 17 H28";

export function PulseMark({ className = "h-6 w-6", animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={`pf-breathe pf-mark ${className}`} aria-hidden="true">
      <path d={MARK_PATH} fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={MARK_PATH} fill="none" stroke="var(--accent)" strokeOpacity="0.75" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={MARK_PATH}
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "pulse-trace" : undefined}
      />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight text-ink">
      <PulseMark />
      Pulse Find
    </Link>
  );
}

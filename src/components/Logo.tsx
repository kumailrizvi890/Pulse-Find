import Link from "next/link";

export function PulseMark({ className = "h-6 w-6", animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={`pf-breathe ${className}`} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M4 17 H9 L11 12 L14.5 22 L17 5 L19.5 27 L21 14 L22.5 17 H28"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.4"
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

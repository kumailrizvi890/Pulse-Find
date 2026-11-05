import Link from "next/link";

export function PulseMark({ className = "h-6 w-6", animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path
        d="M5 17h6l2.5-6 4 11 3-8 1.5 3H27"
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

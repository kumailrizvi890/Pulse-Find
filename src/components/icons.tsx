// Small stroke icons for the buttons that used to be bare Unicode glyphs
// (Nov 16, 2026).
//
// The swipe-deck Pass / Undo / Save buttons, the saved-list remove button
// and the landing terminal Replay button rendered as ✕ (U+2715), ↺
// (U+21BA) and ✓ (U+2713). Those live in the Dingbats / Arrows blocks,
// which Geist does not cover, so they only appeared via a system fallback
// font — and on minimal font setups (the cloud browser among them) they
// showed up missing entirely. An inline SVG renders identically on every
// device, with no font dependency. The paths are plain geometry
// (Feather-style rotate-ccw / x / check), drawn in currentColor so the
// buttons keep their existing colours.

type IconProps = {
  className?: string;
};

function IconBase({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </IconBase>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <polyline points="20 6 9 17 4 12" />
    </IconBase>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </IconBase>
  );
}

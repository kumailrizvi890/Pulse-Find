// Small stroke icons for the buttons and links that used to be bare
// Unicode glyphs (Nov 16, 2026).
//
// The swipe-deck Pass / Undo / Save buttons, the saved-list remove button,
// the landing terminal Replay button and the external-link affordance
// rendered as ✕ (U+2715), ↺ (U+21BA), ✓ (U+2713) and ↗ (U+2197). Those
// live in the Dingbats / Arrows blocks, which Geist does not cover, so
// they only appeared via a system fallback font — and on minimal font
// setups (the cloud browser among them) they showed up missing entirely.
// An inline SVG renders identically on every device, with no font
// dependency. The paths are plain geometry (Feather-style rotate-ccw / x /
// check / arrow-up-right), drawn in currentColor so the buttons and links
// keep their existing colours.

type IconProps = {
  className?: string;
  /** Optional stable marker for tests that query the rendered icon. */
  testId?: string;
};

function IconBase({ className, testId, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      data-testid={testId}
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

/** External-link arrow (Feather arrow-up-right) for links that open a new tab. */
export function IconExternalLink({ className }: IconProps) {
  return (
    <IconBase className={className} testId="external-link-icon">
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </IconBase>
  );
}

/** Details (list) mark for the swipe-deck Details button: three lines with a dot, Feather-style. */
export function IconDetails({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

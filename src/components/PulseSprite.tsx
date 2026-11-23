import Image from "next/image";

/**
 * Pulse, small (Nov 23 2026): the 3D mascot pre-rendered into five
 * transparent poses (public/pulse/pulse-*.png, 320px, ~72KB each) so the
 * small UI (the floating assistant, the chat panel, the dock flight) shows
 * the real Pulse without a live WebGL scene on every page. Same model,
 * same fur and face as the landing hero.
 */
export type PulsePose = "idle" | "wave" | "think" | "talk" | "happy";

export const PULSE_POSES: PulsePose[] = ["idle", "wave", "think", "talk", "happy"];

export const pulseSpriteSrc = (pose: PulsePose) => `/pulse/pulse-${pose}.png`;

export function PulseSprite({
  pose = "idle",
  className,
  priority = false,
  alt = "",
}: {
  pose?: PulsePose;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src={pulseSpriteSrc(pose)}
      alt={alt}
      width={320}
      height={320}
      // Served as-is (already small) so pages can preload every pose
      // by URL and a pose swap never flashes blank.
      unoptimized
      priority={priority}
      draggable={false}
      className={className}
    />
  );
}

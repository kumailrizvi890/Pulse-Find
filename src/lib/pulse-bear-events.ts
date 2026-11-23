// The window event that replays Pulse's greeting. Its own tiny module
// so callers can fire it without importing the three.js scene chunk.
export const PULSE_GREET_EVENT = "pulse:greet";

// A tap anywhere in the hero that is not on Pulse: he turns toward it,
// reacts, and says something. He never re-enters for this one.
export const PULSE_POKE_EVENT = "pulse:poke";

// The hand-off between the landing hero and the floating assistant.
// When the hero Pulse scrolls away, the hero fires PULSE_DOCK_EVENT with
// the screen rect he left from, and the floating assistant flies a
// small Pulse from there down into the corner. Scrolling back up fires
// PULSE_UNDOCK_EVENT with the hero rect; the assistant flies back and,
// once it lands, fires PULSE_RETURNED_EVENT so the hero shows him again.
export const PULSE_DOCK_EVENT = "pulse:dock";
export const PULSE_UNDOCK_EVENT = "pulse:undock";
export const PULSE_RETURNED_EVENT = "pulse:returned";

export type PulseRect = { left: number; top: number; width: number; height: number };
// `live` re-reads the hero spot every frame, so a flight that runs while
// the page is still scrolling lands exactly in the pod.
export type PulseDockDetail = PulseRect & { live?: () => PulseRect };

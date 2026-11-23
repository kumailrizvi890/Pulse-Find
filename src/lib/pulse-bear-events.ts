// The window event that replays Pulse's greeting. Its own tiny module
// so callers can fire it without importing the three.js scene chunk.
export const PULSE_GREET_EVENT = "pulse:greet";

// A tap anywhere in the hero that is not on Pulse: he turns toward it,
// reacts, and says something. He never re-enters for this one.
export const PULSE_POKE_EVENT = "pulse:poke";

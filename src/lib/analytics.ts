/**
 * Analytics events for Pulse Find.
 *
 * A tiny wrapper around Vercel Analytics' `track` so call sites never
 * have to care whether analytics loaded: on the server, in tests, or
 * when the script is blocked, every call is a silent no-op and never
 * throws. Analytics must never break the flow that fired it.
 */
import { track as vercelTrack } from "@vercel/analytics";

export const ANALYTICS_EVENTS = [
  "signup_started",
  "signup_completed",
  "google_signin_started",
  "google_signin_completed",
  "first_application_added",
  "first_import_completed",
  "demo_opened",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    vercelTrack(event, properties);
  } catch {
    // Analytics is best-effort; a blocked script must not break the page.
  }
}

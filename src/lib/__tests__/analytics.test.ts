import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, trackEvent } from "../analytics";

describe("trackEvent", () => {
  it("never throws when window / analytics is absent (server, tests)", () => {
    expect(() => {
      for (const event of ANALYTICS_EVENTS) trackEvent(event);
      trackEvent("demo_opened", { source: "hero" });
    }).not.toThrow();
  });

  it("names exactly the events the Weeks 1-3 pass fires", () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      "signup_started",
      "signup_completed",
      "google_signin_started",
      "google_signin_completed",
      "first_application_added",
      "first_import_completed",
      "demo_opened",
    ]);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Demo Settings had a second dead end beside the Connect link: "Get set
// up in 3 steps" pointed at /app/setup, which redirects signed-out
// visitors to /login. The setup wizard's three steps are "Add your
// tracker", "Connect your agent", "Give your agent its instructions" —
// in the demo the tracker is already sample data, and /demo/connect
// covers the agent steps with a placeholder token, so demo visitors go
// there. Signed-in visitors keep the real wizard at /app/setup, which
// still gates on sign-in.
function read(rel: string): string {
  return readFileSync(join(__dirname, "..", "..", ...rel.split("/")), "utf8");
}

const SETUP_LINK = 'userId ? "/app/setup" : "/demo/connect"';

describe("demo setup link", () => {
  it("sends demo visitors from Settings to /demo/connect, signed-in users to /app/setup", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain(SETUP_LINK);
    expect(dashboard).toContain("Get set up in 3 steps");
  });

  it("leaves no bare /app/setup link in the demo Settings dialog", () => {
    const dashboard = read("components/dashboard/Dashboard.tsx");
    expect(dashboard).not.toContain('href="/app/setup"');
  });

  it("keeps the signed-in Connect page linking to the real setup wizard", () => {
    const connect = read("app/app/connect/page.tsx");
    expect(connect).toContain('href="/app/setup"');
  });

  it("keeps the real setup page gated on sign-in", () => {
    const setup = read("app/app/setup/page.tsx");
    expect(setup).toContain('redirect("/login?next=/app/setup")');
  });

  it("keeps the setup wizard's three steps intact for signed-in users", () => {
    const wizard = read("components/SetupWizard.tsx");
    expect(wizard).toContain('"Add your tracker"');
    expect(wizard).toContain('"Connect your agent"');
    expect(wizard).toContain('"Give your agent its instructions"');
  });
});

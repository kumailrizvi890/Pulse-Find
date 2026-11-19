import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(srcRoot, p), "utf8");

const home = read("app/page.tsx");

// The landing navbar carries a red "Connect" button (Kumail, Nov 18, 5:02am):
// strangers should reach the Connect Agent instructions from the navbar
// itself, not only from the About foot further down the page.
describe("landing navbar Connect button", () => {
    it("shows a Connect button in the top bar that goes to /demo/connect", () => {
        const topBar = home.slice(home.indexOf("<TopBar"), home.indexOf("<main>"));
        expect(topBar).toContain('<Link href="/demo/connect" className={navButton}>Connect</Link>');
    });

    it("styles the button with the red accent treatment, sized for the top bar", () => {
        // The style lives in TopBar.tsx now, shared with /privacy so the
        // public nav matches on both pages; the landing page imports it.
        // Pass 54 sits the button 2px tighter below sm (px-3, back to
        // px-3.5 from sm up) so the public nav fits on one line at 430px.
        const topBar = read("components/TopBar.tsx");
        expect(topBar).toContain("bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink");
        expect(topBar).toContain("sm:px-3.5");
        expect(topBar).toContain("export const navButton");
        expect(home).toContain("navButton");
    });

    it("keeps the existing navbar links and their order", () => {
        const topBar = home.slice(home.indexOf("<TopBar"), home.indexOf("<main>"));
        for (const href of ['href="/jobs"', 'href="/demo"', 'href="/login"']) {
            expect(topBar).toContain(href);
        }
        expect(topBar).toContain("<GitHubLink />");
        // The button is the last item, after Sign in, so it reads as the CTA.
        expect(topBar.indexOf('href="/login"')).toBeLessThan(topBar.indexOf('href="/demo/connect"'));
    });

    it("hides the GitHub link below the sm breakpoint so the row fits on phones", () => {
        const topBar = home.slice(home.indexOf("<TopBar"), home.indexOf("<main>"));
        expect(topBar).toContain('<span className="hidden sm:inline">');
        expect(topBar).toContain("<GitHubLink />");
    });

    it("does not change the About foot Connect, which also points at /demo/connect", () => {
        // The MCP section button is gone with the old landing; the
        // Connect that remains on the page is the About foot's, kept
        // at the preview's absolute URL (see OPEN_QUESTIONS.md).
        const about = read("components/landing/AboutLanding.tsx");
        expect(about).toContain('href="https://pulsefind-app.vercel.app/demo/connect"');
    });
});

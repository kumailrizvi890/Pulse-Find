"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { IconExternalLink } from "@/components/icons";
import { parallaxOffset, sectionProgress } from "@/lib/scroll-anim";

// About redesign (landing only, Nov 20 2026): same approved copy,
// numbers, links, and rigor wording, restyled in the crazy hero's
// language. Feature cards rise in on scroll with a staggered
// cubic-bezier(0.22,1,0.36,1), the founder photo tilts in 3D on
// hover, and the founder numbers count up when they enter view.
// All motion is transform/opacity only, and reduced motion shows
// everything still. The new sixth card is the open-source card:
// MIT licensed, self-host guide in docs/SELF_HOST.md, verified
// against the repo README before shipping.

// The About page: the new landing for signed-out visitors (Nov 19
// 2026). Ported from the first-visit preview: install section sits
// above it (see InstallSection), then this main. (The first-visit
// guided tour was removed Nov 22 2026.)
//
// TEST_COUNT is the true automated-test count from the final `npm
// test` run: it shows in the rigor paragraph, the "N tests · CI"
// chip, and the founder number, all three from this one constant.
// (Preview said 880; the tour + About build moved the count.)
//
// Rigor copy was checked against the repo before shipping and
// softened where the preview overstated it: the sync engine + MCP
// handler are integration-tested (sync-sheet, mcp), the Excel export
// round-trips (xlsx), RLS is enabled on all 11 tables with the public
// job board the one shared read, but no test covers the refresh-jobs
// or sync-trigger Edge Functions, the sha-verification of the two-hour
// sync lives in the external cron script (not this repo), and Vercel
// has gone Ready on a red CI run before, so "a red test stops the
// deploy" is not a true claim. See OPEN_QUESTIONS.md.
const TEST_COUNT = 1142;

export function AboutLanding() {
  const photoRef = useRef<HTMLDivElement>(null);

  // Founder photo parallax, landing only: the photo drifts up to
  // 24px as its section scrolls through view, driven by the shared
  // sectionProgress math. Reduced motion skips it entirely, so the
  // photo stays put. The hover tilt lives on the inner photo ring,
  // so the two transforms never fight.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const photo = photoRef.current;
    if (!photo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let ticking = false;
    const update = () => {
      ticking = false;
      const section = photo.closest("section");
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const p = sectionProgress(window.scrollY, top, rect.height, window.innerHeight);
      photo.style.transform = `translateY(${parallaxOffset(p, 24).toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        raf = requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Scroll reveals + count-up, landing only. Numbers start at their
  // server-rendered final values, so the count-up only ever runs in
  // the browser after the section enters view; reduced motion and
  // no-JS both leave the final values in place.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealEls = Array.from(document.querySelectorAll<HTMLElement>(".reveal-3d"));
    if (reduced) {
      revealEls.forEach((el) => el.classList.add("in"));
      return;
    }
    const ro = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("in");
            ro.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    revealEls.forEach((el) => ro.observe(el));
    const nums = Array.from(document.querySelectorAll<HTMLElement>(".founder-nums b"));
    const co = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const b = e.target as HTMLElement;
          co.unobserve(b);
          const finalText = b.textContent ?? "";
          if (!/^\d/.test(finalText)) continue;
          const final = parseInt(finalText.replace(/[^0-9]/g, ""), 10);
          if (!Number.isFinite(final)) continue;
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / 1000);
            const eased = 1 - Math.pow(1 - p, 3);
            b.textContent = String(Math.round(final * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );
    nums.forEach((b) => co.observe(b));
    return () => {
      ro.disconnect();
      co.disconnect();
    };
  }, []);

  return (
    <main className="about about-3d" id="aboutPage">
      <h2 className="big">
        The internship hunt, <em>run like a system.</em>
      </h2>
      <p className="lede">
        Pulse Find is one dashboard for the whole search: fresh roles matched
        to you every morning, every application tracked by stage, the right
        people lined up to talk to, and an AI agent that can run the busywork
        for you through MCP.
      </p>

      <div className="feat-list">
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 12h4l2.5-6 4 12L16 12h5" stroke="#ff97a3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3>One dashboard</h3>
            <p>Leads, tracker, networking, and files behind a single home, refreshed daily, with anything that needs you floated to the top.</p>
          </div>
          <span className="f-tag">Refreshed daily</span>
        </div>
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="#ff97a3" strokeWidth="2" />
              <path d="m10 9 5 3-5 3V9Z" fill="#ff97a3" />
            </svg>
          </div>
          <div>
            <h3>Leads + the swipe deck</h3>
            <p>Fresh postings that actually fit your level, newest first. Swipe to save and they land straight in your Leads, ready to apply.</p>
          </div>
          <span className="f-tag">Newest first</span>
        </div>
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" stroke="#ff97a3" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h3>Tracker + networking</h3>
            <p>Every application color-coded by stage: red Applied, amber OA, green Interview, plus the recruiters and alumni behind each posting, and an honestly counted response rate.</p>
          </div>
          <span className="f-tag">Exports to .xlsx</span>
        </div>
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="#ff97a3" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3.2" stroke="#ff97a3" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <h3>Bring your own AI agent</h3>
            <p>Pulse Find ships an MCP server, so Claude Code, Cursor, or Copilot can read your tracker, add leads, and update stages. Set it up once with a single prompt.</p>
          </div>
          <span className="f-tag">MCP-native</span>
        </div>
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="#ff97a3" strokeWidth="2" />
              <path d="M11 18.5h2" stroke="#ff97a3" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h3>On your phone, one tap away</h3>
            <p>Add Pulse Find to your home screen. No app store, about 10 seconds. After that it&apos;s an icon tap straight into the same dashboard, full-screen.</p>
          </div>
          <span className="f-tag">
            <a href="#getApp">Get the app ↑</a>
          </span>
        </div>
        <div className="feat reveal-3d">
          <div className="f-ico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m8 8-4 4 4 4m8-8 4 4-4 4" stroke="#ff97a3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3>Open source, self-host it</h3>
            <p>MIT licensed and free to run yourself. One Deploy button, free Supabase and Vercel, and the same code that runs this site.</p>
          </div>
          <span className="f-tag">
            <a href="https://github.com/kumailrizvi890/Pulse-Find" target="_blank" rel="noopener">GitHub ↑</a>
          </span>
        </div>
      </div>

      <section className="founder reveal-3d" aria-label="Meet the founder">
        <div className="founder-grid">
          <div className="founder-photo founder-photo-3d" ref={photoRef}>
            <div className="photo-ring">
              <Image
                src="/founder/kumail-rizvi.webp"
                width={600}
                height={534}
                alt="Kumail Rizvi, founder of Pulse Find"
              />
            </div>
            <div className="fp-name">Kumail Rizvi</div>
            <div className="fp-role">Founder · Builder</div>
            <div className="founder-links">
              <a href="https://www.linkedin.com/in/syedkumailrizvi" target="_blank" rel="noopener">
                LinkedIn <IconExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <a href="https://github.com/kumailrizvi890" target="_blank" rel="noopener">
                GitHub <IconExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <a href="https://portfolio-kumailr.vercel.app" target="_blank" rel="noopener">
                Portfolio <IconExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          </div>
          <div className="founder-body">
            <h3>
              Built by a student, <em>mid-hunt.</em>
            </h3>
            <p>
              I&apos;m Kumail, a computer science senior at UW Bothell,
              graduating December 2027, and the founder of Pulse Find. I built
              it out of my own internship search:{" "}
              <b>hundreds of applications</b>, a spreadsheet that kept falling
              apart, and follow-ups slipping through the cracks. Pulse Find is
              the system I wanted, so I built it, and now it runs my whole
              search.
            </p>
            <p>
              <b>The stack is the fun part.</b> Pulse Find runs on{" "}
              <b>Next.js 16 and React 19</b> with <b>Supabase</b>, Postgres,
              Auth, and Storage, deployed on Vercel, but the headline is the{" "}
              <b>MCP server</b>: Pulse Find plugs straight into Claude Code,
              Cursor, and Copilot, so an AI agent can read a tracker, add
              leads, and update stages like a teammate. On Agensi&apos;s MCP
              marketplace it ranks <b>#1 for &quot;internship&quot;</b>, first
              out of 21 listings.
            </p>
            <p>
              <b>And it&apos;s tested like it matters.</b> Pulse Find runs{" "}
              <b>{TEST_COUNT} automated tests, green in CI on every push</b>:
              unit tests across the tracker, leads, and networking logic,
              integration tests against the Supabase sync engine, and
              end-to-end coverage of the MCP server tools over the real MCP
              protocol, so when an AI agent adds a lead or updates a stage,
              it&apos;s verified before it ever touches real data. The
              two-hour tracker sync records every run, row-level security
              locks your tracker, leads, and contacts to your account, and the
              Excel export is round-trip checked so what you download always
              matches what&apos;s on screen. Nothing ships on a hope. Every
              push runs the full suite in CI, and a red run gets fixed before
              anything else ships.
            </p>
            <div className="stack-chips">
              <span className="hot">MCP server</span>
              <span className="hot">Next.js 16</span>
              <span className="hot">React 19</span>
              <span className="hot">Supabase</span>
              <span className="hot">{TEST_COUNT} tests · CI</span>
              <span>Edge Functions</span>
              <span>pg_cron sync</span>
              <span>Row-level security</span>
              <span>Excel export</span>
              <span>Postgres</span>
              <span>TypeScript</span>
              <span>Python</span>
              <span>Vercel</span>
            </div>
            <div className="founder-nums">
              <div>
                <b>284</b>
                <span>Applications tracked in Pulse Find</span>
              </div>
              <div>
                <b>{TEST_COUNT}</b>
                <span>Automated tests, green in CI</span>
              </div>
              <div>
                <b>6</b>
                <span>Live projects shipped</span>
              </div>
              <div>
                <b>#1 of 21</b>
                <span>For &quot;internship&quot; on Agensi&apos;s MCP listings</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="about-foot">
        <p>
          <b>That&apos;s the whole site.</b> New here? Try the demo with
          sample data, or connect your agent and start your own tracker.
        </p>
        <a
          className="cta2"
          href="https://pulsefind-app.vercel.app/demo/connect"
          target="_blank"
          rel="noopener"
        >
          Connect <IconExternalLink className="h-4 w-4 shrink-0" />
        </a>
      </div>
    </main>
  );
}

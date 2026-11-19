"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ensureInstallPromptListener,
  getInstallPrompt,
  isIOSDevice,
  isStandaloneMode,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/install-prompt";

// Get the app, one tap away (Nov 19 2026): the install section at the
// top of the About landing. Ported from the first-visit preview, with
// the two removals Kumail ordered: no badge, and no step-one line
// telling the visitor to open the site, they are already here, so
// each platform guide is 3 steps (the <ol> renumbers them).
// The install prompt itself is the shared capture in
// src/lib/install-prompt.ts: the button taps .prompt() on tap, never
// auto-fires, and iOS gets the manual Share → Add to Home Screen
// steps instead. The phone mock uses the repo's real app icon
// (/icons/icon-512.png), not the preview's asset.

type Highlight = "ios" | "android" | null;

export function InstallSection() {
  const [label, setLabel] = useState("Add Pulse Find to my phone");
  const [status, setStatus] = useState<ReactNode>(
    "Free · Takes about 10 seconds · Works on iPhone and Android",
  );
  const [installed, setInstalled] = useState(false);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const iosRef = useRef<HTMLDivElement>(null);
  const androidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureInstallPromptListener();
    const sync = () => {
      if (isStandaloneMode()) {
        setInstalled(true);
        setLabel("On your home screen ✓");
        setStatus(
          <>
            <b>Installed.</b> Tap the Pulse Find icon on your home screen. It
            opens straight to your dashboard.
          </>,
        );
        return;
      }
      if (isIOSDevice()) setLabel("Add to Home Screen: show me how");
      if (getInstallPrompt()) {
        setLabel("Install Pulse Find");
        setStatus(
          <>
            <b>Your browser is ready to install it.</b> Tap Install. About 10
            seconds, no app store.
          </>,
        );
      }
    };
    sync();
    return subscribeInstallPrompt(sync);
  }, []);

  const showSteps = (which: Highlight) => {
    setHighlight(which);
    const el = which === "ios" ? iosRef.current : androidRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onInstall = async () => {
    if (installed) return;
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      setInstalled(true);
      setLabel("On your home screen ✓");
      setStatus(
        <>
          <b>Installed.</b> Tap the Pulse Find icon on your home screen. It
          opens straight to your dashboard.
        </>,
      );
      return;
    }
    if (outcome === "dismissed") {
      setStatus(
        "No worries, you can install anytime from your browser menu. Steps for your phone are right below.",
      );
      showSteps(isIOSDevice() ? "ios" : "android");
      return;
    }
    // No native prompt (iOS Safari, or Chrome hasn't offered one yet):
    // the honest, real path is the Share / menu steps, surface them.
    if (isIOSDevice()) {
      setStatus(
        <>
          <b>On iPhone it&apos;s 3 taps in Safari:</b> Share → Add to Home
          Screen → Add. Your steps are highlighted below.
        </>,
      );
      showSteps("ios");
    } else {
      setStatus(
        <>
          <b>Almost there:</b> use your browser&apos;s menu →{" "}
          <b>Install app / Add to Home Screen</b>. Your steps are highlighted
          below.
        </>,
      );
      showSteps("android");
    }
  };

  return (
    <section className="install" id="getApp" aria-label="Get Pulse Find on your phone">
      <div className="install-card">
        <div>
          <h2>
            Your dashboard, <em>one tap away.</em>
          </h2>
          <p className="lede2">
            Add Pulse Find to your home screen and it stops being a website you
            have to go find.{" "}
            <b>
              One tap on the icon and you&apos;re straight into your dashboard
            </b>
            , full-screen, no browser bars, no typing a URL, no hunting through
            tabs.
          </p>
          <div className="locked-note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 1 }}>
              <path d="M20 6 9 17l-5-5" stroke="#2fbf71" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p>
              <b>The dashboard itself doesn&apos;t change.</b> The live UI you
              love stays exactly as it is: same near-black home, red pulse
              line, same cards and chips. Installing just puts{" "}
              <b>that exact dashboard</b> one tap away.
            </p>
          </div>
          <div className="install-actions">
            <button
              className={`btn-install${installed ? " installed" : ""}`}
              type="button"
              onClick={onInstall}
              disabled={installed}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5M4 19h16" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{label}</span>
            </button>
            <a className="cta2 ghost" href="/app" style={{ minHeight: 52 }}>
              Open the dashboard first
            </a>
          </div>
          <p className="install-status" role="status">
            {status}
          </p>
          <div className="platform-steps">
            <div
              className={`p-step${highlight === "ios" ? " hl" : ""}`}
              id="stepIOS"
              ref={iosRef}
            >
              <h4>
                iPhone <span className="os-tag">Safari</span>
              </h4>
              <ol>
                <li>
                  Tap the <b>Share</b> button (square with an arrow)
                </li>
                <li>
                  Tap <b>Add to Home Screen</b>, then <b>Add</b>
                </li>
                <li>Done. The Pulse Find icon is on your home screen</li>
              </ol>
            </div>
            <div
              className={`p-step${highlight === "android" ? " hl" : ""}`}
              id="stepAndroid"
              ref={androidRef}
            >
              <h4>
                Android <span className="os-tag">Chrome</span>
              </h4>
              <ol>
                <li>
                  Tap <b>Install app</b> when it pops up, or the <b>⋮ menu → Install app</b>
                </li>
                <li>
                  Tap <b>Install</b>
                </li>
                <li>Done. It opens full-screen, straight to your dashboard</li>
              </ol>
            </div>
          </div>
          <div className="perks">
            <span>Opens straight to /app</span>
            <span>Full-screen, no browser chrome</span>
            <span>Same login, same data</span>
            <span>Nothing to update, always latest</span>
          </div>
        </div>
        <div className="phone-zone">
          <div>
            <div className="phone" aria-hidden="true">
              <div className="phone-screen">
                <div className="phone-notch"></div>
                <div className="phone-time">9:41</div>
                <div className="phone-date">Your home screen</div>
                <div className="app-grid">
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#3b82f6", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>M</div>
                    <span>Mail</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#f59e0b", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>P</div>
                    <span>Photos</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#22c55e", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>•••</div>
                    <span>Messages</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#ef4444", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>19</div>
                    <span>Calendar</span>
                  </div>
                  <div className="app-ic pulse">
                    <div className="ic">
                      <Image src="/icons/icon-512.png" alt="" width={42} height={42} />
                    </div>
                    <span>Pulse Find</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#ec4899", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>♪</div>
                    <span>Music</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#14b8a6", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>◉</div>
                    <span>Maps</span>
                  </div>
                  <div className="app-ic">
                    <div className="ic" style={{ background: "#6366f1", fontFamily: "'Sora',sans-serif", fontWeight: 800, color: "#fff" }}>◎</div>
                    <span>Safari</span>
                  </div>
                </div>
                <div className="pulse-callout">
                  Tap <b>Pulse Find</b> → you&apos;re in. <b>That&apos;s the one step.</b>
                </div>
              </div>
            </div>
            <p className="phone-cap">
              <b>After install:</b> home screen icon → dashboard. No URL, no login
              hunt, no extra steps.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

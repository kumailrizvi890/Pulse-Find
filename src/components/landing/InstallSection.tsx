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
//
// Nov 22 2026: the section is shown, not told. The written platform
// steps, the dashboard-unchanged note and the perk chips are gone;
// two phones carry it instead: (1) a real iPhone screenshot of the
// Share sheet with Add to Home Screen circled, and (2) the home screen
// with Pulse Find on it. The install button stays, since on Android it
// installs in one tap; on iPhone it points at phone 1.


export function InstallSection() {
  const [label, setLabel] = useState("Add Pulse Find to my phone");
  const [status, setStatus] = useState<ReactNode>(
    "Free · Takes about 10 seconds · Works on iPhone and Android",
  );
  const [installed, setInstalled] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const phonesRef = useRef<HTMLDivElement>(null);

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

  // Point at the two phones: phone 1 is the Share step itself.
  const showSteps = () => {
    setHighlight(true);
    phonesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onInstall = async () => {
    if (installed) return;
    // iPhone: no install prompt exists, so open the Share sheet for
    // them (the Web Share API), the same sheet that holds Add to Home
    // Screen. Called first, before any await, so it still counts as
    // the tap's own gesture, which Safari requires. Pages can't press
    // Safari's toolbar Share button itself; this is the closest real
    // equivalent. Cancelling the sheet is fine: phone 1 still shows
    // where to tap.
    if (isIOSDevice() && !getInstallPrompt() && typeof navigator.share === "function") {
      setStatus(
        <>
          <b>In the Share sheet, scroll down and tap Add to Home Screen</b>,
          then <b>Add</b>.
        </>,
      );
      showSteps();
      try {
        await navigator.share({ title: "Pulse Find", url: `${window.location.origin}/` });
      } catch {
        // Dismissed or unavailable: the status line and phone 1 guide them.
      }
      return;
    }
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
        "No worries, you can install anytime from your browser menu.",
      );
      return;
    }
    // No native prompt (iOS Safari, or Chrome hasn't offered one yet):
    // the honest, real path is the Share / menu steps, surface them.
    if (isIOSDevice()) {
      setStatus(
        <>
          <b>On iPhone it&apos;s 3 taps in Safari:</b> Share → Add to Home
          Screen → Add. Phone 1 shows exactly where.
        </>,
      );
      showSteps();
    } else {
      setStatus(
        <>
          <b>Almost there:</b> use your browser&apos;s menu →{" "}
          <b>Install app / Add to Home Screen</b>, then tap <b>Install</b>.
        </>,
      );
    }
  };

  return (
    <section className="install scroll-mt-24" id="getApp" aria-label="Get Pulse Find on your phone">
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
        </div>
        <div className={`phone-pair${highlight ? " hl" : ""}`} ref={phonesRef}>
          <figure className="phone-step">
            <div className="phone">
              <div className="phone-screen shot">
                <Image
                  src="/landing/ios-add-to-home.jpg"
                  alt="The iPhone Share sheet for pulsefind-app.vercel.app, with Add to Home Screen circled"
                  width={540}
                  height={1096}
                  sizes="200px"
                />
              </div>
            </div>
            <figcaption>
              <span className="step-n">1</span>
              <span>Tap the <b>Share</b> button, then <b>Add to Home Screen</b></span>
            </figcaption>
          </figure>
          <figure className="phone-step">
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
            <figcaption>
              <span className="step-n">2</span>
              <span><b>Pulse Find</b> is on your home screen. One tap, you&apos;re in.</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";

// Get the app, one tap away (Nov 19 2026): the install section at the
// top of the About landing.
//
// Phones-only since Nov 24 2026, at the owner's direction: no heading,
// no copy, no buttons, no captions, just the two phones. (1) a real
// iPhone screenshot of the Share sheet with Add to Home Screen circled,
// and (2) the home screen with Pulse Find on it. The install button,
// the platform steps and the status line were removed with the text;
// installing still works from the browser menu / Share sheet the
// phones show. The phone mock uses the repo's real app icon
// (/icons/icon-512.png).

export function InstallSection() {
  return (
    <section className="install scroll-mt-24" id="getApp" aria-label="Get Pulse Find on your phone">
      <div className="install-card install-card-phones">
        <div className="phone-pair">
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
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

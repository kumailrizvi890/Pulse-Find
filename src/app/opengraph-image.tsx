import { ImageResponse } from "next/og";

export const alt = "Pulse Find: know what's waiting on you in your job search";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f4f6f9", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700, color: "#0f1729" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#2f4bff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 32 32">
              <path d="M5 17h6l2.5-6 4 11 3-8 1.5 3H27" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          Pulse Find
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#0f1729", letterSpacing: -3, lineHeight: 1 }}>Know what&apos;s waiting on you.</div>
          <div style={{ fontSize: 32, color: "#586174" }}>Track applications, catch deadlines, spot who went quiet.</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["Finish HackerRank · 2d left", "Reply with interview times", "Pinecrest · quiet 24 days"].map((t, i) => (
            <div key={t} style={{ display: "flex", padding: "12px 20px", borderRadius: 14, fontSize: 24, background: i < 2 ? "#fdebe8" : "#fdf1dc", color: i < 2 ? "#c8321f" : "#a15c07" }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

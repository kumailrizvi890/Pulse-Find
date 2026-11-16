import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SiteBackdrop } from "@/components/SiteBackdrop";
import "./globals.css";

// Fonts are self-hosted so builds never depend on reaching a font CDN.
const bricolage = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulsefind-app.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Pulse Find", template: "%s · Pulse Find" },
  description:
    "A job application tracker that tells you what's waiting on you: assessments to finish, interviews to schedule, and companies that went quiet.",
  openGraph: {
    title: "Pulse Find",
    description: "Know exactly what's waiting on you in your job search.",
    url: siteUrl,
    siteName: "Pulse Find",
    type: "website",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Pulse Find dashboard: waiting-on-you tasks, application funnel, weekly pace, and networking follow-ups",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pulse Find",
    description: "Know exactly what's waiting on you in your job search.",
    images: [`${siteUrl}/og-image.png`],
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d0c10" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c10" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable} antialiased min-h-dvh`}>
        <SiteBackdrop />
        {children}
      </body>
    </html>
  );
}

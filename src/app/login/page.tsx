import type { Metadata } from "next";
import { Suspense } from "react";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Logo } from "@/components/Logo";
import { PulseTrace } from "@/components/PulseTrace";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="pf-shell relative min-h-dvh overflow-hidden">
      <HeroBackdrop />
      {/* Oversized waveform watermark: faint, behind the form, never competing with it. */}
      <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center" aria-hidden="true">
        <PulseTrace className="h-[180px] w-[min(1400px,220vw)] opacity-[0.13]" />
      </div>
      <header className="gutter relative z-10 mx-auto flex h-14 w-full max-w-[1180px] items-center">
        <Logo href="/" />
      </header>
      <main className="gutter relative z-10 mx-auto flex w-full max-w-[420px] flex-col pb-16 pt-10">
        <PulseTrace className="mb-6 h-8 w-full" />
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}

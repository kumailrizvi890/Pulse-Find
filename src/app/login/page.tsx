import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { PulseTrace } from "@/components/PulseTrace";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="pf-shell min-h-dvh">
      <header className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center">
        <Logo href="/" />
      </header>
      <main className="gutter mx-auto flex w-full max-w-[420px] flex-col pb-16 pt-10">
        <PulseTrace className="mb-6 h-8 w-full" />
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}

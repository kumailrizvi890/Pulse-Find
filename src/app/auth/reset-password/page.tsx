import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { PulseTrace } from "@/components/PulseTrace";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <div className="pf-shell min-h-dvh">
      <header className="gutter mx-auto flex h-14 w-full max-w-[1180px] items-center">
        <Logo href="/" />
      </header>
      <main className="gutter mx-auto flex w-full max-w-[420px] flex-col pb-16 pt-10">
        <PulseTrace className="mb-6 h-8 w-full" />
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </div>
  );
}

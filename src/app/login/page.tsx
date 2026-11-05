import type { Metadata } from "next";
import { Suspense } from "react";
import { TopBar } from "@/components/TopBar";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <TopBar />
      <main className="gutter mx-auto flex w-full max-w-[420px] flex-col pb-16 pt-12">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}

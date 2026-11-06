import type { Metadata } from "next";
import Link from "next/link";
import { TopBar, navLink } from "@/components/TopBar";
import { DemoDashboard } from "./DemoDashboard";

export const metadata: Metadata = { title: "Live demo" };

export default function DemoPage() {
  return (
    <>
      <TopBar right={<><Link href="/jobs" className={navLink}>Jobs</Link><Link href="/login" className={navLink}>Sign in</Link></>} />
      <DemoDashboard />
    </>
  );
}

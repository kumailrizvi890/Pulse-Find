import type { Metadata } from "next";
import { DemoNav } from "./DemoNav";
import { DemoDashboard } from "./DemoDashboard";

export const metadata: Metadata = { title: "Live demo" };

export default function DemoPage() {
  return (
    <>
      <DemoNav />
      <DemoDashboard />
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoLeadsClient from "./DemoLeadsClient";

export const metadata: Metadata = { title: "Leads — Live demo" };

// Public demo route for the Leads pipeline. Renders the same LeadsSection
// as the signed-in app, with fictional sample data only.
export default function DemoLeadsPage() {
  return (
    <>
      <DemoNav />
      <Suspense fallback={null}>
        <DemoLeadsClient />
      </Suspense>
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoNav } from "../DemoNav";
import DemoSheetClient from "./DemoSheetClient";

export const metadata: Metadata = { title: "Sheet — Live demo" };

// Public demo route for the Sheet view. Renders the same SheetView as the
// signed-in app, with fictional sample data only.
export default async function DemoSheetPage({ searchParams }: { searchParams: Promise<{ tour?: string | string[] }> }) {
  const sp = await searchParams;
  return (
    <>
      <DemoNav tour={typeof sp.tour === "string" ? sp.tour : undefined} />
      <Suspense fallback={null}>
        <DemoSheetClient />
      </Suspense>
    </>
  );
}

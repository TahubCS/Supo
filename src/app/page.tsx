import type { Metadata } from "next";

import { DemoWidget } from "@/components/DemoWidget";
import { LandingPage } from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Supo",
  description:
    "Supo is a modern AI support platform for teams that want automation, human handoff, and operational visibility in one place.",
};

export default function HomePage() {
  // A real Supo product that answers from Supo's own docs. Unset: no demo.
  const demoProductId = process.env.NEXT_PUBLIC_SUPO_DEMO_PRODUCT_ID?.trim();

  return (
    <>
      <LandingPage />
      {demoProductId ? <DemoWidget productId={demoProductId} /> : null}
    </>
  );
}

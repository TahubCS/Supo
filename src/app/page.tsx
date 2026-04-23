import type { Metadata } from "next";

import { LandingPage } from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "Supo",
  description:
    "Supo is a modern AI support platform for teams that want automation, human handoff, and operational visibility in one place.",
};

export default function HomePage() {
  return <LandingPage />;
}

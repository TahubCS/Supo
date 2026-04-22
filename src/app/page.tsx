import type { Metadata } from "next";

import { LandingPage } from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "SupportAI",
  description: "AI-powered customer support landing page for SupportAI.",
};

export default function HomePage() {
  return <LandingPage />;
}

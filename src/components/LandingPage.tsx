'use client';

import { CTABanner } from '@/components/CTABanner';
import { DeveloperSection } from '@/components/DeveloperSection';
import { FeaturesSection } from '@/components/FeaturesSection';
import { Footer } from '@/components/Footer';
import { HeroSection } from '@/components/HeroSection';
import { Navbar } from '@/components/Navbar';
import { PricingSection } from '@/components/PricingSection';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <DeveloperSection />
      <PricingSection />
      <CTABanner />
      <Footer />
    </div>
  );
}

'use client';

import { APIPlayground } from '@/components/APIPlayground';
import { CTABanner } from '@/components/CTABanner';
import { FeaturesSection } from '@/components/FeaturesSection';
import { Footer } from '@/components/Footer';
import { HeroSection } from '@/components/HeroSection';
import { Navbar } from '@/components/Navbar';
import { PricingSection } from '@/components/PricingSection';
import { TestimonialsSection } from '@/components/TestimonialsSection';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <APIPlayground />
      <PricingSection />
      <TestimonialsSection />
      <CTABanner />
      <Footer />
    </div>
  );
}

import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-foreground">
              <MessageCircle className="size-4 text-background" />
            </div>
            <span className="text-base font-semibold text-foreground">Supo</span>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="#features"
              className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="#api"
              className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              API
            </Link>
            <Link
              href="#docs"
              className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              Documentation
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="hidden rounded-lg text-[color:var(--text-secondary)] hover:bg-card hover:text-foreground sm:inline-flex"
            >
              Sign In
            </Button>
            <Button
              size="sm"
              className="rounded-lg bg-foreground text-background hover:bg-foreground/90"
            >
              Get Started
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

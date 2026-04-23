import { Github, Linkedin, MessageCircle, Twitter } from "lucide-react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative border-t border-border px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5 md:gap-12">
          <div className="col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground">
                <MessageCircle className="size-4 text-background" />
              </div>
              <span className="text-base font-semibold text-foreground">Supo</span>
            </div>
            <p className="mb-6 max-w-xs text-sm text-[color:var(--text-secondary)]">
              AI-powered customer support for modern businesses.
            </p>
            <div className="flex items-center gap-3">
              <Link
                href="#"
                aria-label="Twitter"
                className="text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
              >
                <Twitter className="size-4" />
              </Link>
              <Link
                href="#"
                aria-label="GitHub"
                className="text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
              >
                <Github className="size-4" />
              </Link>
              <Link
                href="#"
                aria-label="LinkedIn"
                className="text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
              >
                <Linkedin className="size-4" />
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-xs uppercase tracking-wider text-[color:var(--text-tertiary)]">
              Product
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="#features"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="#pricing"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="#api"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  API
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs uppercase tracking-wider text-[color:var(--text-tertiary)]">
              Company
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs uppercase tracking-wider text-[color:var(--text-tertiary)]">
              Legal
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Terms
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  Security
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--status-success)] animate-pulse" />
                  Status
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-xs text-[color:var(--text-tertiary)]">
            © 2026 Supo. All rights reserved.
          </p>
          <p className="text-xs text-[color:var(--text-tertiary)]">
            Built with Claude Code
          </p>
        </div>
      </div>
    </footer>
  );
}

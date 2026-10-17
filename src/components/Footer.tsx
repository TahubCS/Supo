import { Github, MessageCircle } from "lucide-react";
import Link from "next/link";

import { API_DOCS_URL, CHANGELOG_URL, REPO_URL, SECURITY_POLICY_URL } from "@/lib/site";

type FooterLink = { label: string; href: string; external?: boolean };

const linkGroups: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Developers", href: "#developers" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "API reference", href: API_DOCS_URL, external: true },
      { label: "Changelog", href: CHANGELOG_URL, external: true },
      { label: "Security", href: SECURITY_POLICY_URL, external: true },
    ],
  },
];

const linkClassName = "text-sm text-[color:var(--text-secondary)] transition-colors hover:text-foreground";

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={linkClassName}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative border-t border-border px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
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
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Supo on GitHub"
              className="text-[color:var(--text-secondary)] transition-colors hover:text-foreground"
            >
              <Github className="size-4" />
            </a>
          </div>

          {linkGroups.map((group) => (
            <div key={group.title}>
              <h4 className="mb-4 text-xs uppercase tracking-wider text-[color:var(--text-tertiary)]">
                {group.title}
              </h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-xs text-[color:var(--text-tertiary)]">© 2026 Supo. All rights reserved.</p>
          <p className="text-xs text-[color:var(--text-tertiary)]">
            Built with Next.js, Tailwind CSS, and a lot of ☕.
          </p>
        </div>
      </div>
    </footer>
  );
}

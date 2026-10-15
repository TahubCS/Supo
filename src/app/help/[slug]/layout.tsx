import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicHelpCenter } from "@/lib/help-center/service";

export default async function HelpCenterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const center = await getPublicHelpCenter(slug);
  if (!center) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header style={{ backgroundColor: center.accentColor }} className="text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href={`/help/${center.slug}`} className="text-base font-semibold tracking-tight">
            {center.title}
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-[color:var(--text-tertiary)]">
          <span>© {center.productName}</span>
          <span>Powered by Supo</span>
        </div>
      </footer>
    </div>
  );
}

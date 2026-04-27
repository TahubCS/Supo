"use client";

import {
  BarChart2,
  BookOpen,
  ChevronLeft,
  Code2,
  LogOut,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { authClient } from "@/lib/auth-client";

interface ProductSidebarProps {
  userName: string;
  userEmail: string;
  productId: string;
  productName: string;
}

export function ProductSidebar({
  userName,
  userEmail,
  productId,
  productName,
}: ProductSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  const base = `/products/${productId}`;

  const navItems = [
    { href: `${base}/inbox`, icon: MessageSquare, label: "Inbox" },
    { href: `${base}/knowledge`, icon: BookOpen, label: "Knowledge" },
    { href: `${base}/widget`, icon: Code2, label: "Widget" },
    { href: `${base}/analytics`, icon: BarChart2, label: "Analytics" },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      {/* Back to workspace */}
      <div className="border-b border-border px-2 py-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-[color:var(--text-secondary)] transition-colors duration-150 hover:bg-[color:var(--card-elevated)] hover:text-foreground"
        >
          <ChevronLeft className="size-4 shrink-0" />
          All products
        </Link>
      </div>

      {/* Product name */}
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">
          {productName}
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 p-2 pt-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
              isActive(item.href)
                ? "bg-[color:var(--card-elevated)] text-foreground"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--card-elevated)] hover:text-foreground"
            }`}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{userName}</p>
            <p className="truncate text-xs text-[color:var(--text-tertiary)]">
              {userEmail}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="shrink-0 rounded-md p-1.5 text-[color:var(--text-secondary)] transition-colors duration-150 hover:bg-[color:var(--card-elevated)] hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
          <ThemeToggle className="size-7 rounded-md border-transparent bg-transparent backdrop-blur-none hover:bg-[color:var(--card-elevated)]" />
        </div>
      </div>
    </aside>
  );
}

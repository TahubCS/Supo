"use client";

import { LayoutDashboard, LogOut, MessageCircle, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

interface WorkspaceSidebarProps {
  userName: string;
  userEmail: string;
  orgName: string;
  emailVerified: boolean;
  isAdmin?: boolean;
}

export function WorkspaceSidebar({
  userName,
  userEmail,
  orgName,
  emailVerified,
  isAdmin = false,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      {/* Workspace header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-[14px]">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-foreground">
          <MessageCircle className="size-3.5 text-background" />
        </div>
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {orgName}
        </p>
      </div>

      {!emailVerified ? (
        <div className="border-b border-border bg-[color:var(--card-elevated)] px-4 py-2">
          <p className="text-xs text-[color:var(--text-secondary)]">
            <Link
              href="/verify-email"
              className="text-foreground hover:underline"
            >
              Verify your email
            </Link>{" "}
            to secure your account.
          </p>
        </div>
      ) : null}

      <nav className="flex-1 space-y-0.5 p-2 pt-3">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
            isActive("/dashboard")
              ? "bg-[color:var(--card-elevated)] text-foreground"
              : "text-[color:var(--text-secondary)] hover:bg-[color:var(--card-elevated)] hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          Products
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
              isActive("/admin")
                ? "bg-[color:var(--card-elevated)] text-foreground"
                : "text-[color:var(--text-secondary)] hover:bg-[color:var(--card-elevated)] hover:text-foreground"
            }`}
          >
            <ShieldCheck className="size-4 shrink-0" />
            Admin
          </Link>
        ) : null}
      </nav>

      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
            isActive("/settings")
              ? "bg-[color:var(--card-elevated)] text-foreground"
              : "text-[color:var(--text-secondary)] hover:bg-[color:var(--card-elevated)] hover:text-foreground"
          }`}
        >
          <Settings className="size-4 shrink-0" />
          Settings
        </Link>

        <div className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2">
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
        </div>
      </div>
    </aside>
  );
}

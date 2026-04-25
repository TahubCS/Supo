"use client";

import { Ban, Eye, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  type AdminUserSession,
  banUser,
  listUserSessions,
  revokeUserSession,
  revokeUserSessions,
  unbanUser,
} from "./actions";

type AdminUserActionsProps = {
  user: {
    id: string;
    name: string;
    email: string;
    banned: boolean;
    isSuperAdmin: boolean;
  };
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function previewToken(token: string): string {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

export function AdminUserActions({ user }: AdminUserActionsProps) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<AdminUserSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [pending, startTransition] = useTransition();

  async function loadSessions() {
    setIsLoadingSessions(true);
    try {
      setSessions(await listUserSessions(user.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load sessions");
    } finally {
      setIsLoadingSessions(false);
    }
  }

  async function handleDialogChange(open: boolean) {
    setSessionsOpen(open);
    if (open) {
      await loadSessions();
    }
  }

  function runAction(label: string, action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Admin action failed");
      }
    });
  }

  if (user.isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs text-[color:var(--text-secondary)]">
        <ShieldCheck className="size-4" />
        Protected owner
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Dialog open={sessionsOpen} onOpenChange={handleDialogChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-lg">
            <Eye className="size-4" />
            Sessions
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>User sessions</DialogTitle>
            <DialogDescription>
              Active sessions for {user.email}. Tokens are shortened in the UI.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
            {isLoadingSessions ? (
              <div className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[color:var(--text-secondary)]">
                No active sessions.
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="border-b border-border px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-foreground">
                        {previewToken(session.token)}
                      </p>
                      <p className="mt-1 truncate text-xs text-[color:var(--text-secondary)]">
                        {session.userAgent ?? "Unknown user agent"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Revoke this session for ${user.email}?`)) return;
                        runAction("Session revoked", async () => {
                          await revokeUserSession(session.token, user.id);
                          await loadSessions();
                        });
                      }}
                    >
                      <XCircle className="size-4" />
                      Revoke
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[color:var(--text-tertiary)]">
                    <span>IP: {session.ipAddress ?? "unknown"}</span>
                    <span>Created: {formatDate(session.createdAt)}</span>
                    <span>Expires: {formatDate(session.expiresAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Button
        variant="outline"
        size="sm"
        className="rounded-lg"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Revoke all active sessions for ${user.email}?`)) return;
          runAction("All sessions revoked", () => revokeUserSessions(user.id));
        }}
      >
        <RefreshCcw className="size-4" />
        Revoke all
      </Button>

      {user.banned ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Unban ${user.email}?`)) return;
            runAction("User unbanned", () => unbanUser(user.id));
          }}
        >
          <ShieldCheck className="size-4" />
          Unban
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Ban ${user.email} and revoke their sessions?`)) return;
            runAction("User banned", () => banUser(user.id, "Admin security action"));
          }}
        >
          <Ban className="size-4" />
          Ban
        </Button>
      )}
    </div>
  );
}

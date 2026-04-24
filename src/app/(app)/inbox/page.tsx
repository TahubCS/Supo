import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function InboxPage() {
  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Inbox</p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        Conversations
      </h1>

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <MessageSquare className="mb-4 size-8 text-[color:var(--text-secondary)]" />
        <h2 className="mb-2 text-base font-medium text-foreground">
          No conversations yet
        </h2>
        <p className="mb-6 max-w-sm text-sm text-[color:var(--text-secondary)]">
          Customer conversations and AI-escalated support cases will appear
          here once your widget is live.
        </p>
        <Button
          asChild
          variant="outline"
          className="rounded-lg border-border bg-transparent text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
        >
          <Link href="/widget">Set up your widget</Link>
        </Button>
      </div>
    </div>
  );
}

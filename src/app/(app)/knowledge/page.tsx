import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function KnowledgePage() {
  return (
    <div className="px-8 py-8">
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
        Knowledge
      </p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        Knowledge base
      </h1>

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
        <BookOpen className="mb-4 size-8 text-[color:var(--text-secondary)]" />
        <h2 className="mb-2 text-base font-medium text-foreground">
          No knowledge sources
        </h2>
        <p className="mb-6 max-w-sm text-sm text-[color:var(--text-secondary)]">
          Add documentation, FAQs, product pages, or a GitHub repo so your AI
          agent can answer customer questions accurately.
        </p>
        <Button className="rounded-lg bg-foreground text-background hover:bg-foreground/90">
          Add knowledge source
        </Button>
      </div>
    </div>
  );
}

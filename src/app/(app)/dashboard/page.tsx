import { BarChart2, BookOpen, Check, Code2, MessageSquare } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

const setupSteps = [
  {
    id: "workspace",
    label: "Create your workspace",
    description: "Your workspace is ready.",
    href: null,
    done: true,
  },
  {
    id: "knowledge",
    label: "Add a knowledge source",
    description: "Upload docs, FAQs, or a URL so the AI can answer questions.",
    href: "/knowledge",
    done: false,
    icon: BookOpen,
  },
  {
    id: "widget",
    label: "Configure your widget",
    description: "Customise the chat widget your customers will see.",
    href: "/widget",
    done: false,
    icon: Code2,
  },
  {
    id: "embed",
    label: "Embed on your site",
    description: "Copy the script tag and paste it into your product.",
    href: "/widget",
    done: false,
    icon: MessageSquare,
  },
];

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const firstName = session?.user.name.split(" ")[0] ?? "there";

  return (
    <div className="px-8 py-8">
      {/* Page header */}
      <p className="mb-3 text-sm text-[color:var(--text-secondary)]">
        Overview
      </p>
      <h1 className="mb-10 text-3xl font-bold tracking-tight text-foreground">
        Hi {firstName}
      </h1>

      {/* Stats row */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <MessageSquare className="size-4 text-[color:var(--text-secondary)]" />
            <p className="text-xs text-[color:var(--text-secondary)]">
              Conversations today
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">0</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <BarChart2 className="size-4 text-[color:var(--text-secondary)]" />
            <p className="text-xs text-[color:var(--text-secondary)]">
              AI resolution rate
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">—</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <BookOpen className="size-4 text-[color:var(--text-secondary)]" />
            <p className="text-xs text-[color:var(--text-secondary)]">
              Knowledge sources
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">0</p>
        </div>
      </div>

      {/* Getting started */}
      <p className="mb-4 text-sm text-[color:var(--text-secondary)]">
        Getting started
      </p>
      <div className="max-w-2xl divide-y divide-border rounded-lg border border-border bg-card">
        {setupSteps.map((step) => (
          <div key={step.id} className="flex items-start gap-4 px-5 py-4">
            <div
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                step.done
                  ? "border-transparent bg-foreground"
                  : "border-border bg-[color:var(--card-elevated)]"
              }`}
            >
              {step.done ? (
                <Check className="size-3 text-background" />
              ) : null}
            </div>
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  step.done
                    ? "text-[color:var(--text-secondary)] line-through"
                    : "text-foreground"
                }`}
              >
                {step.label}
              </p>
              <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
                {step.description}
              </p>
            </div>
            {!step.done && step.href ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg border-border bg-transparent text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--text-secondary)] hover:bg-transparent hover:text-foreground"
              >
                <Link href={step.href}>Start</Link>
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

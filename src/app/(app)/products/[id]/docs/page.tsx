import { CheckCircle2, Code2, LifeBuoy, Package, Terminal } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { env } from "@/lib/env";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed text-[color:var(--text-secondary)]">
      <code>{code}</code>
    </pre>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <div className="mb-4 max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function DeveloperDocsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getProductAccess(id);
  if (!access || !canAccessProductCapability(access.role, "developerDocs")) {
    notFound();
  }

  const apiBaseUrl = env.BETTER_AUTH_URL;
  const widgetUrl = `${apiBaseUrl}/widget.js`;

  const reactSnippet = `"use client";

import { SupoProvider, SupoWidget } from "@supoapp/widget/react";

export function AppShell({ user, children }) {
  return (
    <SupoProvider
      productId="${id}"
      apiBaseUrl="${apiBaseUrl}"
      customer={{ name: user.name, email: user.email }}
    >
      {children}
      <SupoWidget />
    </SupoProvider>
  );
}`;

  const vanillaSnippet = `import { initSupo } from "@supoapp/widget";

const supo = initSupo({
  productId: "${id}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: { name: user.name, email: user.email },
});

supo.open();`;

  const headlessSnippet = `import { createSupoClient } from "@supoapp/widget/headless";

const supo = createSupoClient({
  productId: "${id}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: { name: user.name, email: user.email },
});

const reply = await supo.sendMessage("I need help with billing");`;

  const fallbackSnippet = `<script>
  window.SupoSettings = {
    productId: "${id}",
    apiBaseUrl: "${apiBaseUrl}"
  };
</script>
<script async src="${widgetUrl}"></script>`;

  return (
    <div className="space-y-8 px-8 py-8">
      <header className="max-w-4xl">
        <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Widget setup</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Setup guide</h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          This page explains what the Supo widget SDK does and the simplest ways to add it to a
          product. The Widget page is still where you configure defaults and preview behavior.
        </p>
      </header>

      <Section title="What we built">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Package className="mt-0.5 size-5 shrink-0 text-[color:var(--text-secondary)]" />
            <div className="min-w-0 space-y-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              <p>
                Supo now has one main widget package: <code>@supoapp/widget</code>. Developers install
                that package in their app and control the widget from their own codebase.
              </p>
              <ul className="space-y-2">
                <li>
                  <code>@supoapp/widget</code> mounts the normal browser widget.
                </li>
                <li>
                  <code>@supoapp/widget/react</code> gives React and Next.js helpers.
                </li>
                <li>
                  <code>@supoapp/widget/headless</code> lets teams build their own chat UI.
                </li>
                <li>The hosted script still works, but it is only the fallback for CMS/no-code sites.</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Install"
        description="Use this product id in every snippet. It tells Supo which product owns the widget, conversations, knowledge, and saved defaults."
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-[color:var(--text-tertiary)]">Product id</p>
            <p className="mt-2 break-all font-mono text-sm text-foreground">{id}</p>
          </div>
          <CodeBlock code="npm install @supoapp/widget@alpha" />
        </div>
      </Section>

      <Section
        title="Use it in React or Next.js"
        description="Put the provider in a client component near your app shell. This mounts the widget and identifies the logged-in user."
      >
        <CodeBlock code={reactSnippet} />
      </Section>

      <Section
        title="Use it without React"
        description="Use the core runtime in Vite, plain TypeScript, or any browser app that can import npm packages."
      >
        <CodeBlock code={vanillaSnippet} />
      </Section>

      <Section
        title="Use your own chat UI"
        description="Use the headless client when you want Supo's backend, persistence, escalation, and realtime behavior, but not Supo's default widget UI."
      >
        <CodeBlock code={headlessSnippet} />
      </Section>

      <Section title="What the SDK handles">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            "Loads saved widget defaults from Supo.",
            "Applies runtime options from your code.",
            "Stores customer and conversation tokens.",
            "Sends customer messages to Supo.",
            "Handles escalation to a human agent.",
            "Uses realtime when available and polling as fallback.",
          ].map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--text-secondary)]" />
              <p className="text-sm text-[color:var(--text-secondary)]">{item}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Fallback embed"
        description="Use this only when the site cannot install npm packages, such as WordPress, Webflow, Shopify custom code, or a CMS footer field."
      >
        <CodeBlock code={fallbackSnippet} />
      </Section>

      <Section
        title="Under the hood"
        description="The SDK calls Supo API routes at runtime. Developers using the SDK do not load a remote widget script, but they still send messages and config requests to this Supo app."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-[color:var(--text-secondary)]" />
              <h3 className="text-sm font-medium text-foreground">Routes</h3>
            </div>
            <div className="mt-4 space-y-2 font-mono text-xs text-[color:var(--text-secondary)]">
              <p>GET /api/widget/config</p>
              <p>POST /api/widget/messages</p>
              <p>POST /api/widget/escalations</p>
              <p>GET /api/widget/messages/poll</p>
              <p>GET /api/widget/realtime/token</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-[color:var(--text-secondary)]" />
              <h3 className="text-sm font-medium text-foreground">Local development</h3>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              Keep <code>apiBaseUrl</code> in local snippets so the SDK knows which Supo server to
              call. Supo Cloud can default this later when the production domain is final.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Troubleshooting">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-[color:var(--text-secondary)]" />
            <h3 className="text-sm font-medium text-foreground">If the widget does not work</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
            <p>Check that the SDK runs in the browser and that the product id matches this page.</p>
            <p>
              Check the browser network tab for <code>/api/widget/messages</code> when sending a
              message.
            </p>
            <p>
              Call <code>reset()</code> while testing if you want to clear the stored customer and
              conversation.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

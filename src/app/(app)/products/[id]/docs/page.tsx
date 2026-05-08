import { CheckCircle2, Code2, LifeBuoy, Package, Radio, ShieldCheck, Terminal } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { env } from "@/lib/env";
import { canAccessProductCapability, getProductAccess } from "@/lib/product-access";

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed text-[color:var(--text-secondary)]">
      <code>{code}</code>
    </pre>
  );
}

function InfoCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Package;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Icon className="size-5 text-[color:var(--text-secondary)]" />
      <h2 className="mt-4 text-sm font-medium text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">{body}</p>
    </div>
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

import { SupoProvider, SupoWidget, useSupo } from "@supo/widget/react";

export function AppShell({ user, children }) {
  return (
    <SupoProvider
      productId="${id}"
      apiBaseUrl="${apiBaseUrl}"
      customer={{ name: user.name, email: user.email }}
      appearance={{ launcherStyle: "icon-label", launcherLabel: "Support" }}
    >
      {children}
      <SupoWidget />
    </SupoProvider>
  );
}

export function HelpButton() {
  const supo = useSupo();
  return <button onClick={() => supo.open()}>Contact support</button>;
}`;

  const vanillaSnippet = `import { initSupo } from "@supo/widget";

const supo = initSupo({
  productId: "${id}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: () => window.currentUser ?? null,
  appearance: {
    theme: "dark",
    launcherStyle: "icon-label",
    launcherLabel: "Support",
  },
});

document.querySelector("#help")?.addEventListener("click", () => {
  supo.open();
});`;

  const headlessSnippet = `import { createSupoClient } from "@supo/widget/headless";

const client = createSupoClient({
  productId: "${id}",
  apiBaseUrl: "${apiBaseUrl}",
  customer: { name: user.name, email: user.email },
});

const answer = await client.sendMessage("I need help with billing");

client.on("message", (message) => {
  console.log(message);
});`;

  const runtimeSnippet = `const supo = initSupo({ productId: "${id}" });

supo.open();
supo.close();
supo.toggle();
supo.identify({ name: "Jane Smith", email: "jane@example.com" });
supo.reset();
supo.destroy();

supo.on("escalation-change", ({ status }) => {
  console.log("Handoff status", status);
});`;

  const fallbackSnippet = `<script>
  window.SupoSettings = {
    productId: "${id}",
    apiBaseUrl: "${apiBaseUrl}"
  };
</script>
<script async src="${widgetUrl}"></script>`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
      <div className="space-y-3">
        <Badge variant="outline" className="w-fit rounded-full text-xs">
          Primary SDK path
        </Badge>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Developer docs
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Install Supo with one package. React helpers, vanilla TypeScript, and headless
            custom UI all ship from <code>@supo/widget</code>. The hosted script remains
            available only for CMS and no-code environments.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          icon={Package}
          title="One dependency"
          body="Use @supo/widget for React, Next.js, Vite, vanilla TypeScript, and headless custom UI."
        />
        <InfoCard
          icon={ShieldCheck}
          title="Public product id"
          body="The product id scopes config, conversations, polling, and realtime tokens. Never expose private API keys."
        />
        <InfoCard
          icon={Radio}
          title="Realtime fallback"
          body="The SDK uses Ably when available and keeps secure polling as the fallback path."
        />
        <InfoCard
          icon={Terminal}
          title="Local API base"
          body="SDK users do not load a remote script, but they still pass apiBaseUrl for local or self-hosted Supo APIs."
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Install</h2>
        </div>
        <div className="mt-4">
          <CodeBlock code="npm install @supo/widget" />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">React and Next.js</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Import React helpers from <code>@supo/widget/react</code>. Use this in a client component.
          </p>
        </div>
        <CodeBlock code={reactSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Vanilla TypeScript</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Use the core runtime when the host app is not React.
          </p>
        </div>
        <CodeBlock code={vanillaSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Headless custom UI</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Use the headless client when the customer app owns the entire chat interface.
          </p>
        </div>
        <CodeBlock code={headlessSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Runtime API</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            The runtime exposes methods and events for custom launchers, logout handling, and analytics.
          </p>
        </div>
        <CodeBlock code={runtimeSnippet} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Canonical SDK routes</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            "GET /api/widget/config",
            "POST /api/widget/messages",
            "POST /api/widget/escalations",
            "GET /api/widget/messages/poll",
            "GET /api/widget/realtime/token",
          ].map((route) => (
            <div key={route} className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-3 font-mono text-xs text-[color:var(--text-secondary)]">
              {route}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Fallback embed</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Use this only where npm packages are unavailable, such as a CMS footer field.
          </p>
        </div>
        <CodeBlock code={fallbackSnippet} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Troubleshooting</h2>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Widget does not show",
              body: "Confirm the SDK is initialized in the browser, productId is correct, and apiBaseUrl points at this Supo app during local development.",
            },
            {
              title: "Messages do not create conversations",
              body: "Check /api/widget/messages in the network tab. Invalid product ids, invalid customer email, or rate limits are the usual causes.",
            },
            {
              title: "Conversation does not continue",
              body: "The SDK stores x-conversation-id and x-conversation-token by product and customer email. Use reset() to clear stale local tests.",
            },
            {
              title: "Realtime is unavailable",
              body: "The SDK automatically falls back to /api/widget/messages/poll. Set realtime: 'polling' to skip realtime entirely.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-[color:var(--card-elevated)] p-4">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

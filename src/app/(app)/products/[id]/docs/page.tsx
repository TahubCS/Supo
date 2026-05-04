import {
  AlertCircle,
  CheckCircle2,
  Code2,
  KeyRound,
  LifeBuoy,
  Radio,
  Settings2,
  ShieldCheck,
} from "lucide-react";
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
  icon: typeof KeyRound;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Icon className="size-5 text-[color:var(--text-secondary)]" />
      <h2 className="mt-4 text-sm font-medium text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {body}
      </p>
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

  const widgetUrl = `${env.BETTER_AUTH_URL}/widget.js`;

  const htmlSnippet = `<!-- Place once before </body> on every page where support should be available. -->
<script>
  window.SupoSettings = {
    productId: "${id}"
  };
</script>
<script async src="${widgetUrl}"></script>`;

  const nextSnippet = `// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}

        {/* Load once in the root layout. Do not add this on every route/page. */}
        <Script id="supo-settings" strategy="beforeInteractive">
          {\`window.SupoSettings = { productId: "${id}" };\`}
        </Script>
        <Script src="${widgetUrl}" strategy="afterInteractive" />
      </body>
    </html>
  );
}`;

  const reactSnippet = `// SupoWidgetLoader.tsx
import { useEffect } from "react";

export function SupoWidgetLoader() {
  useEffect(() => {
    if (document.getElementById("supo-widget-script")) return;

    (window as Window & { SupoSettings?: { productId: string } }).SupoSettings = {
      productId: "${id}"
    };

    const script = document.createElement("script");
    script.id = "supo-widget-script";
    script.src = "${widgetUrl}";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Keep the script mounted if your app uses client-side routing.
    };
  }, []);

  return null;
}`;

  const cmsSnippet = `<!-- Add this in your site footer/custom code area. Load it once per page. -->
<script>
  window.SupoSettings = {
    productId: "${id}"
  };
</script>
<script async src="${widgetUrl}"></script>`;

  const localDevSnippet = `<script>
  window.SupoSettings = {
    productId: "${id}",
    // Only use apiUrl when this script is hosted separately from the Supo API.
    apiUrl: "http://localhost:3000"
  };
</script>
<script async src="${widgetUrl}"></script>`;

  const futureReactSnippet = `// Planned API only. @supo/react is not published yet.
import { SupoProvider, SupoWidget, useSupo } from "@supo/react";

export function AppShell({ currentUser, children }) {
  return (
    <SupoProvider
      productId="${id}"
      customer={{
        name: currentUser.name,
        email: currentUser.email
      }}
      context={{
        accountId: currentUser.accountId,
        currentPath: window.location.pathname
      }}
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

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
      <div className="space-y-3">
        <Badge variant="outline" className="w-fit rounded-full text-xs">
          Available today
        </Badge>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Developer docs
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Install the hosted Supo widget with one script tag. The widget is still in
            beta testing and may be unstable, so keep the integration simple and load it
            once from your app shell or site footer.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <InfoCard
          icon={KeyRound}
          title="Product id"
          body="The product id is the only required public setting. It scopes the widget to this product."
        />
        <InfoCard
          icon={Settings2}
          title="Settings object"
          body="window.SupoSettings must exist before widget.js loads. apiUrl is optional for local or self-hosted API origin testing."
        />
        <InfoCard
          icon={Radio}
          title="Realtime fallback"
          body="Agent replies use Ably when available. The widget falls back to secure polling when realtime is unavailable."
        />
        <InfoCard
          icon={ShieldCheck}
          title="Bearer token"
          body="The widget stores a private conversation token after the first message and sends it for polling and realtime access."
        />
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Installation checklist</h2>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-[color:var(--text-secondary)]">
          <li>Copy one hosted script snippet below into the app root, layout, or footer.</li>
          <li>Keep `window.SupoSettings.productId` exactly as shown for this product.</li>
          <li>Do not pass secrets, API keys, auth tokens, or private user data to `window.SupoSettings`.</li>
          <li>Open the customer site, click the chat bubble, enter name/email, and send a test message.</li>
          <li>Check the Supo inbox for one conversation thread and live agent handoff behavior.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Plain HTML</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Use this for static sites, server-rendered apps, and any page where you can edit HTML.
          </p>
        </div>
        <CodeBlock code={htmlSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Next.js App Router</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Add both scripts once in `app/layout.tsx`. Do not place this inside every page component.
          </p>
        </div>
        <CodeBlock code={nextSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">React or Vite</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Mount this loader once near the app root. The guard prevents duplicate script injection.
          </p>
        </div>
        <CodeBlock code={reactSnippet} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">WordPress or custom CMS</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Paste this into your footer/custom code area so it loads on every customer-facing page.
          </p>
        </div>
        <CodeBlock code={cmsSnippet} />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium text-foreground">Current widget contract</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-foreground">Supported settings today</p>
            <ul className="mt-2 space-y-2 text-sm text-[color:var(--text-secondary)]">
              <li>`productId`: required. The public product identifier Supo uses to load config and create conversations.</li>
              <li>`apiUrl`: optional. Use only when widget.js is served from a different origin than the Supo API.</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Customer identity today</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              The hosted widget asks the visitor for name and email inside the chat panel.
              Passing `customer` through `window.SupoSettings` is planned, but not supported
              by the current hosted script.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Conversation persistence</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              After the first message, Supo returns `x-conversation-id` and
              `x-conversation-token`. The widget stores them in browser storage per product
              and customer email so refreshes can restore the active conversation.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Handoff behavior</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              If the AI offers handoff, the widget can request an agent. The inbox receives
              a pending handoff, agents can join it, and the widget receives agent replies
              through realtime or polling fallback.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Widget customization</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              Product admins and developers can configure branding, launcher style, panel
              size, copy, and Supo attribution from the Widget page. These settings are
              loaded by the hosted script; developers do not need to add extra script
              options for them.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Beta notice</p>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              The customer-facing beta testing notice is always visible during alpha. The
              footer attribution can be hidden from the Widget page, but the beta notice is
              not configurable yet.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="mb-1 text-sm font-medium text-foreground">Local development override</p>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Only use `apiUrl` when embedding a hosted or copied script into a separate local app.
            For normal Supo-hosted widget usage, omit it.
          </p>
        </div>
        <CodeBlock code={localDevSnippet} />
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
              body: "Confirm the script URL loads, `window.SupoSettings.productId` is set before widget.js, and the browser is not blocking third-party scripts.",
            },
            {
              title: "Messages do not create conversations",
              body: "Check the network tab for `/api/chat` failures. The most common causes are wrong API origin, blocked requests, or invalid product id.",
            },
            {
              title: "Conversation does not continue",
              body: "The widget needs `x-conversation-id` and `x-conversation-token` from `/api/chat`. Clear local storage for stale test conversations.",
            },
            {
              title: "Agent replies are not live",
              body: "Realtime uses Ably when configured. If token requests fail, the widget should continue through `/api/messages/poll` every few seconds.",
            },
            {
              title: "Customer email is rejected",
              body: "The widget and API reject malformed emails before database writes. Use a normal email address with one `@` and a valid domain.",
            },
            {
              title: "Separate local app testing",
              body: "If the customer app is on a different local port, set `apiUrl` to the Supo dev server origin, such as `http://localhost:3000`.",
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

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">Future React SDK</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          The hosted script is the supported integration path today. A typed React SDK is
          planned, but `@supo/react` is not published yet and should not be installed in
          production apps.
        </p>
        <div className="mt-4">
          <CodeBlock code={futureReactSnippet} />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-[color:var(--text-secondary)]" />
          <h2 className="text-sm font-medium text-foreground">What the widget manages internally</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          The hosted script calls Supo public widget endpoints for config, chat streaming,
          conversation polling, realtime token requests, and escalation. Developers should
          install the script instead of calling those endpoints directly unless they are
          building a future SDK or custom integration with Supo-owned code.
        </p>
      </section>
    </div>
  );
}

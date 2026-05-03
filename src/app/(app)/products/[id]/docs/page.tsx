import { Code2, Component, KeyRound, Radio } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { getProductAccess, canAccessProductCapability } from "@/lib/product-access";

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

  const reactExample = `import { SupoProvider, SupoWidget } from "@supo/react";

export function App() {
  return (
    <SupoProvider productId="${id}">
      <SupoWidget
        customer={{
          name: currentUser.name,
          email: currentUser.email,
        }}
      />
      <YourApp />
    </SupoProvider>
  );
}`;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-8">
      <div className="space-y-3">
        <Badge variant="outline" className="w-fit rounded-full text-xs">
          Developer preview
        </Badge>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Developer docs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
            Start with the React integration path. The script embed remains supported for
            compatibility, but new product work should target typed React components first.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: KeyRound,
            title: "Product id",
            body: "Every widget connection is scoped to the product id shown in the configurator.",
          },
          {
            icon: Component,
            title: "Customer identity",
            body: "Pass the signed-in customer's name and email so Supo can keep one active support thread per session.",
          },
          {
            icon: Radio,
            title: "Realtime and fallback",
            body: "Realtime updates use Ably when available, with secure polling as the fallback path.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-card p-5">
            <item.icon className="size-5 text-[color:var(--text-secondary)]" />
            <h2 className="mt-4 text-sm font-medium text-foreground">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Code2 className="size-4 text-[color:var(--text-secondary)]" />
            <h2 className="text-sm font-medium text-foreground">React target API</h2>
          </div>
        </div>
        <pre className="overflow-x-auto p-5 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          <code>{reactExample}</code>
        </pre>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-medium text-foreground">Planned session context</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Session replay, co-browse, and framework-specific SDKs are intentionally deferred.
          The first supported contract will expose lightweight page, route, and user activity
          hooks that help agents understand what the customer was doing before escalation.
        </p>
      </section>
    </div>
  );
}

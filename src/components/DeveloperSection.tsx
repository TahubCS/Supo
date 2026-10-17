"use client";

import { ArrowRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

import { API_DOCS_URL } from "@/lib/site";
import { PRODUCTION_ORIGIN } from "@/lib/trusted-origins";

// Snippets must match the published @supoapp/widget package and docs/API.md.
const codeExamples = {
  react: `npm install @supoapp/widget@alpha

import { SupoProvider, SupoWidget } from "@supoapp/widget/react";

<SupoProvider
  productId="YOUR_PRODUCT_ID"
  apiBaseUrl="${PRODUCTION_ORIGIN}"
  customer={{ externalId: user.id, name: user.name, email: user.email }}
>
  <SupoWidget />
</SupoProvider>`,
  script: `<script>
  window.SupoSettings = { productId: "YOUR_PRODUCT_ID" };
</script>
<script async src="${PRODUCTION_ORIGIN}/widget.js"></script>`,
  rest: `curl -X POST ${PRODUCTION_ORIGIN}/api/v1/knowledge/search \\
  -H "Authorization: Bearer supo_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "How do I reset my password?", "answer": true }'`,
};

type Tab = keyof typeof codeExamples;

const tabLabels: Record<Tab, string> = {
  react: "React",
  script: "Script tag",
  rest: "REST API",
};

export function DeveloperSection() {
  const [activeTab, setActiveTab] = useState<Tab>("react");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeExamples[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="developers" className="relative border-t border-border px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <p className="mb-3 text-sm text-[color:var(--text-secondary)]">Developers</p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Built for developers
            </h2>
            <p className="mb-6 text-base leading-relaxed text-[color:var(--text-secondary)]">
              Embed the widget with the React SDK or a script tag, identify signed-in customers, and
              automate the rest with the REST API and signed webhooks.
            </p>
            <a
              href={API_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-[color:var(--text-secondary)]"
            >
              Read the API reference
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                {(Object.keys(codeExamples) as Tab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded px-3 py-1.5 text-xs transition-all ${
                      activeTab === tab
                        ? "bg-[color:var(--card-elevated)] text-foreground"
                        : "text-[color:var(--text-secondary)] hover:text-foreground"
                    }`}
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded p-1.5 transition-colors hover:bg-[color:var(--card-elevated)]"
                  aria-label="Copy code"
                >
                  {copied ? (
                    <Check className="size-4 text-foreground" />
                  ) : (
                    <Copy className="size-4 text-[color:var(--text-secondary)]" />
                  )}
                </button>
              </div>

              <div className="overflow-x-auto bg-background p-4 font-mono text-xs">
                <pre className="text-[#a3a3a3]">
                  <code>{codeExamples[activeTab]}</code>
                </pre>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

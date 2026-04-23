"use client";

import { ArrowRight, Check, Copy } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

const codeExamples = {
  curl: `curl -X POST https://api.supo.ai/v1/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "How do I reset my password?",
    "user_id": "user_123"
  }'`,
  node: `const client = new Supo('YOUR_API_KEY');

const response = await client.chat.create({
  message: 'How do I reset my password?',
  userId: 'user_123'
});`,
  python: `client = Supo(api_key='YOUR_API_KEY')

response = client.chat.create(
  message='How do I reset my password?',
  user_id='user_123'
)`,
};

export function APIPlayground() {
  const [activeTab, setActiveTab] = useState<"curl" | "node" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeExamples[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="api" className="relative border-t border-border px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <p className="mb-3 text-sm text-[color:var(--text-secondary)]">API</p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Built for developers
            </h2>
            <p className="mb-6 text-base leading-relaxed text-[color:var(--text-secondary)]">
              Integrate AI-powered support into your application with our REST API
              and SDKs. Available for Node.js, Python, and PHP with full TypeScript
              support.
            </p>
            <Link
              href="#"
              className="group inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-[color:var(--text-secondary)]"
            >
              View documentation
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                {(["curl", "node", "python"] as const).map((tab) => (
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
                    {tab === "curl" ? "cURL" : tab === "node" ? "Node.js" : "Python"}
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

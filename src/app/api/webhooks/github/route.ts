import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/github/app";
import { handleGitHubWebhook, type GitHubWebhookPayload } from "@/lib/github/webhook";

// Webhook updates queue indexing jobs that run after the response.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

// GitHub App webhook. The HMAC signature is checked against the raw body before
// anything is parsed; work is queued so GitHub gets a fast response.
export async function POST(req: Request) {
  const secret = env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "GitHub App webhooks are not configured" }, { status: 503 });

  const payload = await req.text();
  if (payload.length > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyWebhookSignature(payload, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return NextResponse.json({ ok: true });

  let body: GitHubWebhookPayload;
  try {
    body = JSON.parse(payload) as GitHubWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleGitHubWebhook(event, body);
  return NextResponse.json({ ok: true, result });
}

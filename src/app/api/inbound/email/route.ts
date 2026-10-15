import { NextResponse } from "next/server";

import { getClient } from "@/lib/email";
import { EMAIL_JOB_TYPES, isEmailChannelConfigured } from "@/lib/email-channel/service";
import { env } from "@/lib/env";
import { enqueueAndKick } from "@/lib/jobs/queue";

// Resend inbound webhook (`email.received`). The signature (Svix) is checked
// against the raw body; the email itself is fetched and processed by a job so
// this responds quickly and provider retries are de-duplicated.
export async function POST(req: Request) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret || !isEmailChannelConfigured()) {
    return NextResponse.json({ error: "Email channel is not configured" }, { status: 503 });
  }

  const payload = await req.text();
  if (payload.length > 256 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = getClient().webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") return NextResponse.json({ ok: true, ignored: event.type ?? null });
  const emailId = event.data?.email_id;
  if (typeof emailId !== "string" || !emailId) return NextResponse.json({ error: "Missing email_id" }, { status: 400 });

  await enqueueAndKick(EMAIL_JOB_TYPES.inbound, { emailId }, { dedupeKey: `${EMAIL_JOB_TYPES.inbound}:${emailId}`, maxAttempts: 5 });
  return NextResponse.json({ ok: true });
}

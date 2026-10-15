import { Resend } from "resend";

import { env } from "@/lib/env";

let client: Resend | null = null;

function getClient(): Resend {
  client ??= new Resend(env.RESEND_API_KEY.trim());
  return client;
}

export function defaultFromAddress(): string {
  return env.SECURITY_ALERT_FROM_EMAIL ?? "Supo <onboarding@resend.dev>";
}

export function appUrl(path = ""): string {
  return `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}${path}`;
}

/** Sends a transactional email. Throws on failure so background jobs retry. */
export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<string> {
  const response = await getClient().emails.send({
    from: defaultFromAddress(),
    to,
    subject: subject.replace(/[\r\n]+/g, " ").slice(0, 200),
    html,
    replyTo,
  });
  if (response.error) throw new Error(response.error.message);
  return response.data?.id ?? "";
}

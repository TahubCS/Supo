import { Resend } from "resend";

import { env } from "@/lib/env";
import type { ProductRole } from "@/lib/product-access";

const resend = new Resend(env.RESEND_API_KEY);
const INVITE_FROM = env.SECURITY_ALERT_FROM_EMAIL ?? "Supo <onboarding@resend.dev>";

export async function sendProductInviteEmail({
  to,
  inviterName,
  productName,
  role,
}: {
  to: string;
  inviterName: string;
  productName: string;
  role: ProductRole;
}): Promise<boolean> {
  const appUrl = env.BETTER_AUTH_URL;

  try {
    await resend.emails.send({
      from: INVITE_FROM,
      to,
      subject: `You were invited to ${productName} on Supo`,
      html: `
        <p>Hi there,</p>
        <p>${inviterName} invited you to work on <strong>${productName}</strong> in Supo as a <strong>${role}</strong>.</p>
        <p><a href="${appUrl}/sign-up?email=${encodeURIComponent(to)}" style="color:#000;font-weight:600">Accept invite</a></p>
        <p style="color:#737373;font-size:13px">After you sign in with this email, Supo will automatically apply the product role if the invite is still active.</p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

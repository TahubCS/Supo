import { Resend } from "resend";

import { env } from "@/lib/env";
import type { ProductRole } from "@/lib/product-access";

const resend = new Resend(env.RESEND_API_KEY);
const INVITE_FROM = env.SECURITY_ALERT_FROM_EMAIL ?? "Supo <onboarding@resend.dev>";

export type ProductInviteEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

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
}): Promise<ProductInviteEmailResult> {
  const appUrl = env.BETTER_AUTH_URL;

  try {
    const response = await resend.emails.send({
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

    if (response.error) {
      return { ok: false, error: response.error.message };
    }

    if (!response.data?.id) {
      return { ok: false, error: "Resend did not return an email id" };
    }

    return { ok: true, id: response.data.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Resend error",
    };
  }
}

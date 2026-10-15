import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { conversation } from "@/db/schema";
import { appUrl, sendEmail } from "@/lib/email";
import { inboxRecipients } from "@/lib/handoff/jobs";
import { escapeHtml } from "@/lib/html";
import { registerSweeper } from "@/lib/jobs/queue";

import { findSlaWarnings } from "./service";

// Emails the team once per conversation when a first-response SLA is about
// to breach (or already has).
registerSweeper("sla-warnings", async () => {
  const due = await findSlaWarnings();
  for (const conv of due) {
    const claimed = await db
      .update(conversation)
      .set({ slaWarningSentAt: new Date() })
      .where(and(eq(conversation.id, conv.id), isNull(conversation.slaWarningSentAt)))
      .returning({ id: conversation.id });
    if (claimed.length === 0) continue;

    const recipients = await inboxRecipients(conv.productId, conv.product.organizationId);
    if (recipients.length === 0) continue;
    const overdue = conv.firstResponseDueAt && conv.firstResponseDueAt.getTime() < Date.now();
    const link = appUrl(`/products/${conv.productId}/inbox?conversation=${conv.id}`);
    await sendEmail({
      to: recipients,
      subject: `${overdue ? "SLA breached" : "SLA due soon"}: ${conv.customer.name} — ${conv.product.name}`,
      html: `
        <p>The first-response target for <strong>${escapeHtml(conv.customer.name)}</strong>${
          conv.subject ? ` (“${escapeHtml(conv.subject)}”)` : ""
        } ${overdue ? "has passed" : "is due within 10 minutes"}.</p>
        <p style="color:#737373;font-size:13px">Priority: ${escapeHtml(conv.priority)} · Due ${escapeHtml(
          conv.firstResponseDueAt?.toUTCString() ?? "",
        )}</p>
        <p><a href="${escapeHtml(link)}" style="color:#000;font-weight:600">Reply now</a></p>
      `,
    }).catch((error) => console.error("[sla] warning email failed", error));
  }
});

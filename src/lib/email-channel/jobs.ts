import { registerJobHandler } from "@/lib/jobs/queue";

import { EMAIL_JOB_TYPES, fetchInboundEmail, ingestInboundEmail, sendEmailReply } from "./service";

registerJobHandler(EMAIL_JOB_TYPES.inbound, async (payload) => {
  if (typeof payload.emailId !== "string") throw new Error("payload.emailId is required");
  await ingestInboundEmail(await fetchInboundEmail(payload.emailId));
});

registerJobHandler(EMAIL_JOB_TYPES.outbound, async (payload) => {
  if (typeof payload.messageId !== "string") throw new Error("payload.messageId is required");
  await sendEmailReply(payload.messageId);
});

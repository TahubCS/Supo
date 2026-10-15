import { registerJobHandler } from "@/lib/jobs/queue";

import { deliverWebhook, WEBHOOK_JOB_TYPE } from "./service";

registerJobHandler(WEBHOOK_JOB_TYPE, async (payload, { isFinalAttempt }) => {
  const deliveryId = payload.deliveryId;
  if (typeof deliveryId !== "string" || !deliveryId) throw new Error("payload.deliveryId is required");
  await deliverWebhook(deliveryId, { isFinalAttempt });
});

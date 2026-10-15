import { registerSweeper } from "@/lib/jobs/queue";

import { applyRetention } from "./service";

// Retention runs at most hourly per instance (sweepers run on every drain).
const INTERVAL_MS = 60 * 60 * 1000;
let lastRun = 0;

registerSweeper("data-retention", async () => {
  if (Date.now() - lastRun < INTERVAL_MS) return;
  lastRun = Date.now();
  const result = await applyRetention();
  if (result.conversations || result.customers || result.deliveries) {
    console.info("[retention] deleted", result);
  }
});

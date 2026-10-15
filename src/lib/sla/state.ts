// Pure SLA helpers safe to import from client components.

export const SLA_WARNING_LEAD_MS = 10 * 60 * 1000;

export type SlaState = "none" | "met" | "ok" | "due_soon" | "breached";

/** Pure: SLA state of the first response for display. */
export function firstResponseState(
  conv: { firstResponseDueAt: Date | null; firstResponseAt: Date | null },
  now = new Date(),
): SlaState {
  if (!conv.firstResponseDueAt) return "none";
  if (conv.firstResponseAt) return conv.firstResponseAt <= conv.firstResponseDueAt ? "met" : "breached";
  const remaining = conv.firstResponseDueAt.getTime() - now.getTime();
  if (remaining < 0) return "breached";
  return remaining <= SLA_WARNING_LEAD_MS ? "due_soon" : "ok";
}

/** Pure: SLA state of the resolution target for display. */
export function resolutionState(
  conv: { resolutionDueAt: Date | null; resolvedAt: Date | null; status: string },
  now = new Date(),
): SlaState {
  if (!conv.resolutionDueAt) return "none";
  if (conv.status === "resolved" && conv.resolvedAt) {
    return conv.resolvedAt <= conv.resolutionDueAt ? "met" : "breached";
  }
  const remaining = conv.resolutionDueAt.getTime() - now.getTime();
  if (remaining < 0) return "breached";
  return remaining <= SLA_WARNING_LEAD_MS ? "due_soon" : "ok";
}

/**
 * Sort key for the inbox "due soon" order: the earliest outstanding SLA
 * deadline, or Infinity when nothing is pending.
 */
export function nextSlaDeadline(
  conv: {
    firstResponseDueAt: Date | null;
    firstResponseAt: Date | null;
    resolutionDueAt: Date | null;
    status: string;
  },
): number {
  if (conv.status === "resolved") return Number.POSITIVE_INFINITY;
  const deadlines: number[] = [];
  if (conv.firstResponseDueAt && !conv.firstResponseAt) deadlines.push(conv.firstResponseDueAt.getTime());
  if (conv.resolutionDueAt) deadlines.push(conv.resolutionDueAt.getTime());
  return deadlines.length > 0 ? Math.min(...deadlines) : Number.POSITIVE_INFINITY;
}

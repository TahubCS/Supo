// Pure routing helpers (no database access) so they can be unit tested.

/** Least-loaded agent below the cap; ties broken by the given order. */
export function pickRoundRobinAgent(
  candidates: string[],
  activeCounts: Record<string, number>,
  maxConcurrent: number,
): string | null {
  let best: string | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const id of candidates) {
    const load = activeCounts[id] ?? 0;
    if (load >= maxConcurrent) continue;
    if (load < bestLoad) {
      best = id;
      bestLoad = load;
    }
  }
  return best;
}

// Client-safe: shared by the analytics page, dashboard and CSV export.

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseRange(value: string | string[] | undefined | null): AnalyticsRange {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}

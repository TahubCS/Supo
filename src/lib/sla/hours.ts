// Business hours and SLA due-date math. Pure and timezone-aware (Intl only,
// no dependencies) so it can be unit tested and used on server and client.

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type TimeRange = { start: string; end: string }; // "HH:MM", end exclusive
export type WeeklySchedule = Partial<Record<Weekday, TimeRange[]>>;

export type BusinessHoursConfig = {
  enabled: boolean;
  timezone: string;
  schedule: WeeklySchedule;
  holidays: string[]; // "YYYY-MM-DD" in the business timezone
};

export const DEFAULT_SCHEDULE: WeeklySchedule = {
  mon: [{ start: "09:00", end: "17:00" }],
  tue: [{ start: "09:00", end: "17:00" }],
  wed: [{ start: "09:00", end: "17:00" }],
  thu: [{ start: "09:00", end: "17:00" }],
  fri: [{ start: "09:00", end: "17:00" }],
};

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: Weekday };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function localParts(date: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday).toLowerCase().slice(0, 3) as Weekday,
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function dateKey(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instant for a wall-clock time in the given timezone (DST-safe). */
export function zonedTimeToUtc(year: number, month: number, day: number, minuteOfDay: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  // Correct the guess by the zone offset observed at that instant (twice for DST edges).
  let instant = guess;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(instant), timeZone);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    instant += guess - observed;
  }
  return new Date(instant);
}

function rangesFor(config: BusinessHoursConfig, local: { year: number; month: number; day: number; weekday: Weekday }) {
  if (config.holidays.includes(dateKey(local))) return [];
  return (config.schedule[local.weekday] ?? [])
    .map((r) => ({ start: minutesOf(r.start), end: minutesOf(r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
}

export function isWithinBusinessHours(date: Date, config: BusinessHoursConfig): boolean {
  if (!config.enabled) return true;
  const local = localParts(date, config.timezone);
  const minute = local.hour * 60 + local.minute;
  return rangesFor(config, local).some((r) => minute >= r.start && minute < r.end);
}

/**
 * Adds working minutes to `start`, skipping time outside business hours.
 * With business hours disabled this is plain wall-clock addition.
 */
export function addBusinessMinutes(start: Date, minutes: number, config: BusinessHoursConfig): Date {
  if (!config.enabled) return new Date(start.getTime() + minutes * 60_000);
  let remaining = minutes;
  let cursor = start;

  for (let day = 0; day < 400; day++) {
    const local = localParts(cursor, config.timezone);
    const dayRanges = rangesFor(config, local);
    const cursorMinute = day === 0 ? local.hour * 60 + local.minute : 0;

    for (const range of dayRanges) {
      const from = Math.max(range.start, cursorMinute);
      if (from >= range.end) continue;
      const available = range.end - from;
      if (remaining <= available) {
        return zonedTimeToUtc(local.year, local.month, local.day, from + remaining, config.timezone);
      }
      remaining -= available;
    }

    // Move to local midnight of the next day.
    const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    cursor = zonedTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, config.timezone);
  }
  // No working time within ~a year (empty schedule): fall back to wall clock.
  return new Date(start.getTime() + minutes * 60_000);
}

export function normalizeSchedule(value: unknown): WeeklySchedule {
  const out: WeeklySchedule = {};
  if (!value || typeof value !== "object") return out;
  for (const day of WEEKDAYS) {
    const ranges = (value as Record<string, unknown>)[day];
    if (!Array.isArray(ranges)) continue;
    const valid = ranges
      .filter(
        (r): r is TimeRange =>
          typeof r === "object" &&
          r !== null &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(String((r as TimeRange).start)) &&
          /^([01]\d|2[0-4]):[0-5]\d$/.test(String((r as TimeRange).end)),
      )
      .filter((r) => minutesOf(r.end) > minutesOf(r.start))
      .slice(0, 4);
    if (valid.length) out[day] = valid.map((r) => ({ start: r.start, end: r.end }));
  }
  return out;
}

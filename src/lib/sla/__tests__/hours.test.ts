import { describe, expect, it } from "vitest";

import {
  addBusinessMinutes,
  DEFAULT_SCHEDULE,
  isWithinBusinessHours,
  normalizeSchedule,
  zonedTimeToUtc,
  type BusinessHoursConfig,
} from "@/lib/sla/hours";

const ny: BusinessHoursConfig = {
  enabled: true,
  timezone: "America/New_York",
  schedule: DEFAULT_SCHEDULE,
  holidays: ["2026-12-25"],
};

describe("zonedTimeToUtc", () => {
  it("handles standard and daylight time", () => {
    expect(zonedTimeToUtc(2026, 1, 15, 9 * 60, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(zonedTimeToUtc(2026, 7, 15, 9 * 60, "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });
});

describe("isWithinBusinessHours", () => {
  it("respects schedule, timezone, weekends and holidays", () => {
    expect(isWithinBusinessHours(new Date("2026-10-14T14:00:00Z"), ny)).toBe(true); // Wed 10:00 EDT
    expect(isWithinBusinessHours(new Date("2026-10-14T22:00:00Z"), ny)).toBe(false); // Wed 18:00
    expect(isWithinBusinessHours(new Date("2026-10-17T15:00:00Z"), ny)).toBe(false); // Saturday
    expect(isWithinBusinessHours(new Date("2026-12-25T15:00:00Z"), ny)).toBe(false); // holiday
    expect(isWithinBusinessHours(new Date("2026-10-17T15:00:00Z"), { ...ny, enabled: false })).toBe(true);
  });
});

describe("addBusinessMinutes", () => {
  it("adds within the same working day", () => {
    expect(addBusinessMinutes(new Date("2026-10-14T14:00:00Z"), 60, ny).toISOString()).toBe("2026-10-14T15:00:00.000Z");
  });

  it("carries over nights and weekends", () => {
    // Friday 16:30 EDT + 60 working minutes = Monday 09:30 EDT
    expect(addBusinessMinutes(new Date("2026-10-16T20:30:00Z"), 60, ny).toISOString()).toBe("2026-10-19T13:30:00.000Z");
  });

  it("starts counting at opening time when created outside hours", () => {
    // Saturday + 30 minutes = Monday 09:30 EDT
    expect(addBusinessMinutes(new Date("2026-10-17T12:00:00Z"), 30, ny).toISOString()).toBe("2026-10-19T13:30:00.000Z");
  });

  it("skips holidays and crosses DST", () => {
    // Thu Dec 24 16:00 EST + 120 min: 60 that day, holiday Fri, weekend, 60 on Mon Dec 28 -> 10:00 EST
    expect(addBusinessMinutes(new Date("2026-12-24T21:00:00Z"), 120, ny).toISOString()).toBe("2026-12-28T15:00:00.000Z");
    // Fri Oct 30 16:00 EDT + 120 min -> Mon Nov 2 10:00 EST (after DST ends)
    expect(addBusinessMinutes(new Date("2026-10-30T20:00:00Z"), 120, ny).toISOString()).toBe("2026-11-02T15:00:00.000Z");
  });

  it("is wall-clock time when business hours are disabled", () => {
    expect(addBusinessMinutes(new Date("2026-10-17T12:00:00Z"), 30, { ...ny, enabled: false }).toISOString()).toBe(
      "2026-10-17T12:30:00.000Z",
    );
  });
});

describe("normalizeSchedule", () => {
  it("drops invalid ranges", () => {
    expect(
      normalizeSchedule({ mon: [{ start: "09:00", end: "17:00" }, { start: "18:00", end: "17:00" }], xyz: [], tue: "no" }),
    ).toEqual({ mon: [{ start: "09:00", end: "17:00" }] });
  });
});

describe("firstResponseState", async () => {
  const { firstResponseState } = await import("@/lib/sla/state");
  const now = new Date("2026-10-14T12:00:00Z");
  const due = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("classifies pending and answered conversations", () => {
    expect(firstResponseState({ firstResponseDueAt: null, firstResponseAt: null }, now)).toBe("none");
    expect(firstResponseState({ firstResponseDueAt: due(60), firstResponseAt: null }, now)).toBe("ok");
    expect(firstResponseState({ firstResponseDueAt: due(5), firstResponseAt: null }, now)).toBe("due_soon");
    expect(firstResponseState({ firstResponseDueAt: due(-1), firstResponseAt: null }, now)).toBe("breached");
    expect(firstResponseState({ firstResponseDueAt: due(10), firstResponseAt: due(5) }, now)).toBe("met");
    expect(firstResponseState({ firstResponseDueAt: due(-10), firstResponseAt: due(-5) }, now)).toBe("breached");
  });
});

describe("resolutionState and nextSlaDeadline", async () => {
  const { resolutionState, nextSlaDeadline } = await import("@/lib/sla/state");
  const now = new Date("2026-10-14T12:00:00Z");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("classifies resolution targets", () => {
    expect(resolutionState({ resolutionDueAt: null, resolvedAt: null, status: "open" }, now)).toBe("none");
    expect(resolutionState({ resolutionDueAt: at(120), resolvedAt: null, status: "open" }, now)).toBe("ok");
    expect(resolutionState({ resolutionDueAt: at(3), resolvedAt: null, status: "open" }, now)).toBe("due_soon");
    expect(resolutionState({ resolutionDueAt: at(-3), resolvedAt: null, status: "open" }, now)).toBe("breached");
    expect(resolutionState({ resolutionDueAt: at(-3), resolvedAt: at(-10), status: "resolved" }, now)).toBe("met");
    expect(resolutionState({ resolutionDueAt: at(-10), resolvedAt: at(-3), status: "resolved" }, now)).toBe("breached");
  });

  it("orders by the earliest outstanding deadline", () => {
    const base = { firstResponseDueAt: null, firstResponseAt: null, resolutionDueAt: null, status: "open" };
    expect(nextSlaDeadline(base)).toBe(Number.POSITIVE_INFINITY);
    expect(nextSlaDeadline({ ...base, firstResponseDueAt: at(5), resolutionDueAt: at(60) })).toBe(at(5).getTime());
    // A met first response no longer counts; the resolution target does.
    expect(nextSlaDeadline({ ...base, firstResponseDueAt: at(5), firstResponseAt: at(-1), resolutionDueAt: at(60) })).toBe(
      at(60).getTime(),
    );
    expect(nextSlaDeadline({ ...base, firstResponseDueAt: at(5), status: "resolved" })).toBe(Number.POSITIVE_INFINITY);
  });
});

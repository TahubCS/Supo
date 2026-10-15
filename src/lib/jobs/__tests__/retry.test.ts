import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { retryDelayMs } = await import("@/lib/jobs/queue");

describe("retryDelayMs", () => {
  it("backs off exponentially and caps at two hours", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(480_000);
    expect(retryDelayMs(20)).toBe(2 * 60 * 60 * 1000);
  });
});

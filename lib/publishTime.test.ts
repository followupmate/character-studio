import { describe, it, expect } from "vitest";
import { scheduledIso } from "./publishTime";

describe("scheduledIso", () => {
  const NOW = Date.parse("2026-07-01T08:00:00.000Z");

  it("schedules at the character's posting time on the given date (UTC)", () => {
    expect(scheduledIso("2026-07-02", "10:00", 0, NOW)).toBe("2026-07-02T10:00:00.000Z");
  });

  it("applies the offset (reel = +8h prime time)", () => {
    expect(scheduledIso("2026-07-02", "10:00", 8 * 60, NOW)).toBe("2026-07-02T18:00:00.000Z");
  });

  it("never schedules into the past — pushes to now + 1 min", () => {
    expect(scheduledIso("2026-06-01", "10:00", 0, NOW)).toBe(new Date(NOW + 60_000).toISOString());
  });

  it("falls back to 10:00 on malformed posting_time", () => {
    expect(scheduledIso("2026-07-02", "", 0, NOW)).toBe("2026-07-02T10:00:00.000Z");
  });
});

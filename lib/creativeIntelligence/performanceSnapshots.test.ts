import { describe, it, expect } from "vitest";
import { horizonsToCapture, computeAgeHours, SNAPSHOT_HORIZONS } from "./performanceSnapshots";

// Pure-function tests only (no Supabase) — house convention, see
// generationStrategyAdapter.test.ts. captureMaturedSnapshots/captureCurrentObservation are
// DB-touching wrappers around horizonsToCapture and are verified via the real backfill run
// instead.

function graceFor(horizon: "24h" | "72h" | "7d") {
  return SNAPSHOT_HORIZONS.find((h) => h.horizon === horizon)!;
}

describe("computeAgeHours", () => {
  it("computes hours between posted_at and now", () => {
    const postedAt = "2026-08-01T00:00:00.000Z";
    const now = new Date("2026-08-02T00:00:00.000Z");
    expect(computeAgeHours(postedAt, now)).toBe(24);
  });
});

describe("horizonsToCapture", () => {
  it("captures nothing before 24h", () => {
    expect(horizonsToCapture(10, new Set())).toEqual([]);
  });

  it("captures 24h once age >= 24, even a bit late (e.g. hour 26, within the 6h grace)", () => {
    const due = horizonsToCapture(26, new Set());
    expect(due).toEqual([{ horizon: "24h", ageHours: 26 }]);
  });

  it("does not re-capture 24h if it already exists — 24h snapshot is created only once", () => {
    const due = horizonsToCapture(26, new Set(["24h"]));
    expect(due).toEqual([]);
  });

  it("does not create 72h prematurely (age 50h — well before the 72h horizon)", () => {
    const due = horizonsToCapture(50, new Set());
    expect(due).toEqual([]);
  });

  it("real-world case: a post ~40h old on its first-ever check gets NO 24h snapshot (40h is well past the 24h+6h grace cutoff of 30h) and is not yet 72h old either", () => {
    const due = horizonsToCapture(40, new Set());
    expect(due).toEqual([]);
  });

  it("captures 72h once age >= 72, independent of 24h status", () => {
    const due = horizonsToCapture(80, new Set(["24h"]));
    expect(due).toEqual([{ horizon: "72h", ageHours: 80 }]);
  });

  it("captures 7d (168h) once age >= 168", () => {
    const due = horizonsToCapture(170, new Set(["24h", "72h"]));
    expect(due).toEqual([{ horizon: "7d", ageHours: 170 }]);
  });

  it("with tight per-horizon grace, no two horizons can ever be simultaneously due in one call (hourly cron never needs multi-horizon catch-up)", () => {
    // 24h's capturable range is [24, 30]; 72h's is [72, 84] — no overlap is possible.
    for (let age = 0; age <= 220; age += 1) {
      const due = horizonsToCapture(age, new Set());
      expect(due.length).toBeLessThanOrEqual(1);
    }
  });

  it("never backdates a horizon once its grace window has passed (stale first-import protection)", () => {
    // 24h horizon: min 24 + grace 6 = 30h cutoff — a post first imported at 300h old must NOT
    // get a fabricated "24h" snapshot from 300h-old cumulative data.
    const due = horizonsToCapture(300, new Set());
    expect(due.find((d) => d.horizon === "24h")).toBeUndefined();
    expect(due).toEqual([]); // also past 72h's and 7d's grace by this point
  });

  it("still captures 7d for a post whose first check lands inside 7d's own grace window", () => {
    const due = horizonsToCapture(170, new Set());
    // 24h (cutoff 30h) and 72h (cutoff 84h) are both stale at 170h -> excluded.
    // 7d (min 168, grace 24 -> cutoff 192) is NOT stale at 170h -> included.
    expect(due).toEqual([{ horizon: "7d", ageHours: 170 }]);
  });

  it("grace boundary is inclusive at exactly minAgeHours + graceHours, for every horizon", () => {
    for (const { horizon, minAgeHours, graceHours } of SNAPSHOT_HORIZONS) {
      const boundary = minAgeHours + graceHours;
      expect(horizonsToCapture(boundary, new Set()).some((d) => d.horizon === horizon)).toBe(true);
      expect(horizonsToCapture(boundary + 0.01, new Set()).some((d) => d.horizon === horizon)).toBe(false);
    }
  });

  it("24h/72h/7d grace windows match the approved configuration exactly", () => {
    expect(graceFor("24h").graceHours).toBe(6);
    expect(graceFor("72h").graceHours).toBe(12);
    expect(graceFor("7d").graceHours).toBe(24);
  });

  it("captures nothing when all three horizons already exist", () => {
    const due = horizonsToCapture(200, new Set(["24h", "72h", "7d"]));
    expect(due).toEqual([]);
  });
});

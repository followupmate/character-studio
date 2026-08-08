import { describe, it, expect } from "vitest";
import { resolveCycleState, buildKeysetFilter, resolveBatchSize, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from "./importInsightsCursor";

describe("resolveCycleState", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("starts a new cycle when no cursor row exists yet", () => {
    const state = resolveCycleState(null, 90, now);
    expect(state.isNewCycle).toBe(true);
    expect(state.cursorPostedAt).toBeNull();
    expect(state.cursorPostId).toBeNull();
    expect(state.cycleStartedAt).toBe(now.toISOString());
  });

  it("starts a new cycle when the previous cycle completed", () => {
    const existing = {
      window_days: 90,
      cursor_posted_at: "2026-08-01T00:00:00.000Z",
      cursor_post_id: "post-1",
      cycle_started_at: "2026-08-05T00:00:00.000Z",
      cycle_complete: true,
    };
    const state = resolveCycleState(existing, 90, now);
    expect(state.isNewCycle).toBe(true);
    expect(state.cursorPostedAt).toBeNull();
  });

  it("starts a new cycle when the window size changed", () => {
    const existing = {
      window_days: 30,
      cursor_posted_at: "2026-08-01T00:00:00.000Z",
      cursor_post_id: "post-1",
      cycle_started_at: "2026-08-05T00:00:00.000Z",
      cycle_complete: false,
    };
    const state = resolveCycleState(existing, 90, now);
    expect(state.isNewCycle).toBe(true);
  });

  it("resumes from the persisted cursor when the cycle is mid-flight and window matches", () => {
    const existing = {
      window_days: 90,
      cursor_posted_at: "2026-08-01T00:00:00.000Z",
      cursor_post_id: "post-1",
      cycle_started_at: "2026-08-05T00:00:00.000Z",
      cycle_complete: false,
    };
    const state = resolveCycleState(existing, 90, now);
    expect(state.isNewCycle).toBe(false);
    expect(state.cursorPostedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(state.cursorPostId).toBe("post-1");
    expect(state.cycleStartedAt).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("buildKeysetFilter", () => {
  it("builds a strictly-older-than filter with an id tiebreaker for same-timestamp posts", () => {
    const filter = buildKeysetFilter("2026-08-01T00:00:00.000Z", "post-1");
    expect(filter).toBe("posted_at.lt.2026-08-01T00:00:00.000Z,and(posted_at.eq.2026-08-01T00:00:00.000Z,id.lt.post-1)");
  });
});

describe("resolveBatchSize", () => {
  it("defaults when no param given", () => {
    expect(resolveBatchSize(null)).toBe(DEFAULT_BATCH_SIZE);
  });

  it("defaults on non-numeric or zero/negative input", () => {
    expect(resolveBatchSize("abc")).toBe(DEFAULT_BATCH_SIZE);
    expect(resolveBatchSize("0")).toBe(DEFAULT_BATCH_SIZE);
    expect(resolveBatchSize("-5")).toBe(DEFAULT_BATCH_SIZE);
  });

  it("honors a valid override", () => {
    expect(resolveBatchSize("10")).toBe(10);
  });

  it("caps at MAX_BATCH_SIZE", () => {
    expect(resolveBatchSize("500")).toBe(MAX_BATCH_SIZE);
  });

  it("floors fractional input", () => {
    expect(resolveBatchSize("15.9")).toBe(15);
  });
});

import { describe, it, expect } from "vitest";
import { microEventPhaseCandidates, microEventOutputSpec, LifeEvent } from "./lifeState";

function event(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    event_type: "weekend_trip",
    title: "a short weekend trip",
    emotional_weight: 6,
    starts_at: "2026-07-20",
    ends_at: "2026-07-22",
    status: "active",
    ...overrides,
  };
}

describe("microEventPhaseCandidates", () => {
  it("a single-day event (ends_at === starts_at implicitly, via null) offers only 'event' on its day", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: null });
    expect(microEventPhaseCandidates(e, "2026-07-20")).toEqual(["event"]);
  });

  it("offers 'aftermath' on the single day immediately after a 1-day event", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: null });
    expect(microEventPhaseCandidates(e, "2026-07-21")).toEqual(["aftermath"]);
  });

  it("does not keep offering aftermath indefinitely after a 1-day event", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: null });
    expect(microEventPhaseCandidates(e, "2026-07-23")).toEqual(["standalone"]);
  });

  it("a 3-day event offers setup+event on day 1, event on day 2, event+aftermath on day 3", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: "2026-07-22" });
    expect(microEventPhaseCandidates(e, "2026-07-20")).toEqual(["setup", "event"]);
    expect(microEventPhaseCandidates(e, "2026-07-21")).toEqual(["event"]);
    expect(microEventPhaseCandidates(e, "2026-07-22")).toEqual(["event", "aftermath"]);
  });

  it("offers 'aftermath' the day right after a multi-day event ends", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: "2026-07-22" });
    expect(microEventPhaseCandidates(e, "2026-07-23")).toEqual(["aftermath"]);
  });

  it("returns 'standalone' for a date before the event starts", () => {
    const e = event({ starts_at: "2026-07-20", ends_at: "2026-07-22" });
    expect(microEventPhaseCandidates(e, "2026-07-19")).toEqual(["standalone"]);
  });
});

describe("microEventOutputSpec", () => {
  it("produces non-empty prompt text naming the event title and candidate phases", () => {
    const e = event();
    const spec = microEventOutputSpec(e, ["setup", "event"]);
    expect(spec).toContain(e.title);
    expect(spec).toContain("setup");
    expect(spec).toContain("event");
  });

  it("instructs aftermath to be shown via physical consequence, never narrated", () => {
    const spec = microEventOutputSpec(event(), ["event", "aftermath"]);
    expect(spec).toMatch(/never narrated/i);
  });
});

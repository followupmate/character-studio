import { describe, it, expect } from "vitest";
import { reelHookOverrideFor, scrubTravelContext, stripTravelFromLifeState } from "./reelHookOverrides";

const FF = { reel_hook_overrides: {
  "2026-11-04": { hook_text: "meow", tag: "bindi_v1", location: "cosy living room, daylight", episode_guidance: "cat costume" },
  "2026-11-12": { hook_text: "did you see it?", tag: "bindi_v1", location: "hotel room by a large window", episode_guidance: "white shirt" },
} };

describe("scene days ignore arc/travel context", () => {
  const o = reelHookOverrideFor(FF, "2026-11-04");
  it("drops city/hotel/suitcase sentences, keeps the rest", () => {
    const t = "She wakes slowly. Her suitcase is still open in the Lisbon hotel.\nDay 3: Lisbon — calm — tram ride\nDay 4: home — warm — coffee";
    const out = scrubTravelContext(t, o)!;
    expect(out).toContain("She wakes slowly.");
    expect(out).toContain("coffee");
    expect(out).not.toMatch(/lisbon|hotel|suitcase/i);
  });
  it("life_state loses current_city and travel threads", () => {
    const ls = stripTravelFromLifeState({ current_city: "Lisbon", current_place_type: "hotel", mood_state: "soft", recent_event: "landed at the airport", unresolved_thread: "a text from a friend" }, o)!;
    expect(ls.current_city).toBeUndefined();
    expect(ls.current_place_type).toBeUndefined();
    expect(ls.recent_event).toBeUndefined();
    expect(ls.unresolved_thread).toBe("a text from a friend");
    expect(ls.mood_state).toBe("soft");
  });
  it("words the scene itself uses stay; non-scene days unchanged", () => {
    const o12 = reelHookOverrideFor(FF, "2026-11-12");
    expect(scrubTravelContext("Morning light in the hotel room. Lisbon outside.", o12)).toBe("Morning light in the hotel room.");
    expect(scrubTravelContext("Lisbon hotel.", null)).toBe("Lisbon hotel.");
    expect(stripTravelFromLifeState({ current_city: "Lisbon" }, null)).toEqual({ current_city: "Lisbon" });
  });
});

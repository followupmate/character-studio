import { describe, it, expect } from "vitest";
import {
  getArcDayContext,
  arcContextBlock,
  validateArcPlan,
  type Arc,
  type ArcDayContext,
} from "@/lib/arcPlanner";

describe("arcPlanner", () => {
  const mockCharacterId = "char-123";
  const today = "2026-08-21";

  const mockTrip: Arc = {
    id: "arc-1",
    character_id: mockCharacterId,
    arc_type: "trip",
    title: "Three days in Lisbon",
    premise: "Exploring Alfama and discovering new light",
    city: "Lisbon",
    start_date: "2026-08-21",
    end_date: "2026-08-24",
    day_plan: [
      {
        day_index: 0,
        phase: "anticipation",
        focus: "Packing and last-minute errands",
        location_hint: "Barcelona apartment and airport",
      },
      {
        day_index: 1,
        phase: "arrival",
        focus: "Arriving in Lisbon, hotel check-in",
        location_hint: "Hotel lobby and room",
      },
      {
        day_index: 2,
        phase: "peak",
        focus: "Exploring Alfama at golden hour",
        location_hint: "Alfama terrace overlooking Tejo river",
      },
      {
        day_index: 3,
        phase: "departure",
        focus: "Last morning, heading to airport",
        location_hint: "Hotel and Lisbon airport",
      },
    ],
    fanvue_hook: "The rest of that evening, off the terrace",
    status: "active",
    created_at: new Date().toISOString(),
  };

  const mockHomeInterlude: Arc = {
    id: "arc-2",
    character_id: mockCharacterId,
    arc_type: "home_interlude",
    title: "The bedroom project",
    premise: "Redecorating and nesting",
    city: "Barcelona",
    start_date: "2026-08-24",
    end_date: "2026-08-26",
    day_plan: [
      {
        day_index: 0,
        phase: "setup",
        focus: "Planning and shopping for materials",
        location_hint: "Barcelona apartment and design shops",
      },
      {
        day_index: 1,
        phase: "build",
        focus: "Painting and redesigning",
        location_hint: "Bedroom",
      },
      {
        day_index: 2,
        phase: "aftermath",
        focus: "Admiring the new space",
        location_hint: "Bedroom with new light",
      },
    ],
    status: "planned",
    created_at: new Date().toISOString(),
  };

  describe("getArcDayContext", () => {
    it("should return day 1 context for first day of arc", () => {
      const ctx = getArcDayContext(mockTrip, "2026-08-21");
      expect(ctx).not.toBeNull();
      if (ctx) {
        expect(ctx.dayIndex).toBe(1);
        expect(ctx.dayCount).toBe(4);
        expect(ctx.phase).toBe("anticipation");
        expect(ctx.city).toBe("Lisbon");
        expect(ctx.isLastDay).toBe(false);
      }
    });

    it("should return peak day context for day 3", () => {
      const ctx = getArcDayContext(mockTrip, "2026-08-23");
      expect(ctx).not.toBeNull();
      if (ctx) {
        expect(ctx.dayIndex).toBe(3);
        expect(ctx.dayCount).toBe(4);
        expect(ctx.phase).toBe("peak");
        expect(ctx.isLastDay).toBe(false);
        expect(ctx.city).toBe("Lisbon");
      }
    });

    it("should return last day context", () => {
      const ctx = getArcDayContext(mockTrip, "2026-08-24");
      expect(ctx).not.toBeNull();
      if (ctx) {
        expect(ctx.dayIndex).toBe(4);
        expect(ctx.isLastDay).toBe(true);
      }
    });

    it("should return null for date outside arc range", () => {
      const ctx = getArcDayContext(mockTrip, "2026-08-20");
      expect(ctx).toBeNull();

      const ctx2 = getArcDayContext(mockTrip, "2026-08-25");
      expect(ctx2).toBeNull();
    });
  });

  describe("arcContextBlock", () => {
    it("should format context block with phase, city, and focus", () => {
      const ctx: ArcDayContext = {
        phase: "peak",
        dayIndex: 3,
        dayCount: 4,
        focus: "Exploring Alfama at golden hour",
        city: "Lisbon",
        locationHint: "Alfama terrace",
        isLastDay: false,
      };

      const block = arcContextBlock(ctx, mockTrip);
      expect(block).toContain("day 3/4");
      expect(block).toContain("Three days in Lisbon");
      expect(block).toContain("Lisbon");
      expect(block).toContain("peak");
      expect(block).toContain("MANDATORY");
      expect(block).toContain("current_city MUST equal \"Lisbon\"");
    });
  });

  describe("validateArcPlan", () => {
    it("should pass valid trip arc", () => {
      const errors = validateArcPlan(mockTrip, []);
      expect(errors).toHaveLength(0);
    });

    it("should pass valid home_interlude after trip", () => {
      const errors = validateArcPlan(mockHomeInterlude, [mockTrip]);
      expect(errors).toHaveLength(0);
    });

    it("should fail if trip follows another trip without home_interlude in between", () => {
      const errors = validateArcPlan(mockTrip, [mockTrip]);
      expect(errors.some((e) => e.includes("trip"))).toBe(true);
    });

    it("should fail if home_interlude is not in Barcelona", () => {
      const badHome: Arc = { ...mockHomeInterlude, city: "Paris" };
      const errors = validateArcPlan(badHome, []);
      expect(errors.some((e) => e.includes("Barcelona"))).toBe(true);
    });

    it("should fail if trip is in Barcelona", () => {
      const badTrip: Arc = { ...mockTrip, city: "Barcelona" };
      const errors = validateArcPlan(badTrip, []);
      expect(errors.some((e) => e.includes("Barcelona"))).toBe(true);
    });

    it("should fail if start_date > end_date", () => {
      const badDates: Arc = {
        ...mockTrip,
        start_date: "2026-08-25",
        end_date: "2026-08-20",
      };
      const errors = validateArcPlan(badDates, []);
      expect(errors.some((e) => e.includes("start_date"))).toBe(true);
    });

    it("should fail if day_plan length doesn't match arc duration", () => {
      const badPlan: Arc = {
        ...mockTrip,
        day_plan: [mockTrip.day_plan[0], mockTrip.day_plan[1]],
      };
      const errors = validateArcPlan(badPlan, []);
      expect(errors.some((e) => e.includes("day_plan length"))).toBe(true);
    });

    it("should fail if 3 same arc_types in a row", () => {
      const tripleTrip: Arc = { ...mockTrip, start_date: "2026-09-04", end_date: "2026-09-06" };
      const errors = validateArcPlan(tripleTrip, [mockTrip, mockTrip]);
      expect(errors.some((e) => e.includes("3 consecutive"))).toBe(true);
    });
  });
});

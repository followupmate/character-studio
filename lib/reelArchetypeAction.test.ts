import { describe, expect, it } from "vitest";
import { plannedActionForReelArchetype, REEL_ARCHETYPE_ACTION } from "./reelArchetypeAction";

// Canonical home for this pure lookup (see file header — extracted out of lib/dailyBatch.ts so a
// CLIENT component, components/dashboard/GenerationControls.tsx, can import it without pulling in
// server-only code). lib/dailyBatch.ts re-exports the same function; its own tests continue to
// cover the wiring into generateSlotPromptViaDirector.

describe("plannedActionForReelArchetype", () => {
  it("maps each known motion archetype to a concrete action", () => {
    for (const id of Object.keys(REEL_ARCHETYPE_ACTION)) {
      expect(plannedActionForReelArchetype(id)).toBe(REEL_ARCHETYPE_ACTION[id]);
    }
  });

  it("returns undefined for an unknown archetype or no archetype, never invents one", () => {
    expect(plannedActionForReelArchetype("some_future_archetype")).toBeUndefined();
    expect(plannedActionForReelArchetype(undefined)).toBeUndefined();
  });
});

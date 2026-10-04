import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 1 (2026-10): new Fanvue drafts never carry an Instagram caption CTA.
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/lib/supabase", () => {
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    const self = () => c;
    c.select = self;
    c.eq = self;
    c.gte = self;
    c.limit = self;
    c.insert = (row: Record<string, unknown>) => {
      if (table === "chs_fanvue_unlocks") inserted.push(row);
      return c;
    };
    c.single = async () => ({ data: { id: "unlock-1" }, error: null });
    // awaiting the chain (existing-draft lookup) resolves to "no rows"
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return c;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import { maybeCreateFanvueUnlock } from "@/lib/fanvueUnlock";

const baseArgs = {
  characterId: "c1",
  storyDayId: "d1",
  dailyPlanId: "p1",
  storyDay: { tier: "intimate_aesthetic", moment_family: null, magnetism_level: null, location: "hotel room", mood: "calm", ig_caption: null, hook_text: null },
  sceneBriefJson: null,
};

describe("maybeCreateFanvueUnlock — ig_cta removed", () => {
  beforeEach(() => {
    inserted.length = 0;
    vi.spyOn(Math, "random").mockReturnValue(0); // always passes the probability gate
  });

  it("legacy row: ig_cta is null", async () => {
    const r = await maybeCreateFanvueUnlock(baseArgs);
    expect(r.created).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].ig_cta).toBeNull();
  });

  it("paid_continuation_v1 row: ig_cta is null", async () => {
    const r = await maybeCreateFanvueUnlock({ ...baseArgs, pipelineV1: true });
    expect(r.created).toBe(true);
    expect(inserted[0].ig_cta).toBeNull();
  });
});

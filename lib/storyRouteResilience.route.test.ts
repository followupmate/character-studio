import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 6 — GET /api/characters/story: one character's failure must not abort the run, and a day
// that appeared during the (minutes-long) generation must not be inserted twice.

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  characters: [] as Row[],
  // per character id: sequence of maybeSingle() answers for chs_story_days (existing check, race re-check)
  storyDayLookups: {} as Record<string, Array<Row | null>>,
  inserts: [] as Row[],
  genFailFor: new Set<string>(),
  batchCalls: [] as string[],
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const f: Record<string, unknown> = {};
    let op = "select";
    let payload: Row | null = null;
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => ((f[k] = v), builder),
      order: () => builder,
      limit: () => builder,
      insert: (p: Row) => ((op = "insert"), (payload = p), state.inserts.push(p), builder),
      maybeSingle: async () => {
        if (table === "chs_story_days") {
          const q = state.storyDayLookups[String(f.character_id)] ?? [];
          return { data: q.length ? q.shift() : null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => (op === "insert" ? { data: { id: `sd-${(payload as Row).character_id}`, day_number: (payload as Row).day_number }, error: null } : { data: null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (table === "chs_characters") resolve({ data: state.characters, error: null });
        else if (table === "chs_story_days") resolve({ data: [{ day_number: 129, location: "l", mood: "m", narrative: "n", arc_position: "quiet" }], error: null });
        else resolve({ data: [], error: null });
      },
    };
    return builder;
  }
  return { supabase: { from } };
});

vi.mock("@/lib/storyGeneration", () => ({
  generateStoryDayContent: async ({ character, deadlineAt }: { character: { id: string }; deadlineAt?: number }) => {
    if (state.genFailFor.has(character.id)) throw new Error("Story JSON parse failed. Claude returned: {\"loc");
    expect(typeof deadlineAt).toBe("number");
    return {
      story: { location: "terrace", mood: "m", narrative: "n", arc_position: "quiet", ig_caption: "c", hashtags: [], scene: {} },
      tier: "everyday_life", driftSeeds: [], family: null, magnetism: null, lifeOn: false, strategyInput: null,
    };
  },
}));
vi.mock("@/lib/dailyBatch", () => ({
  generateDailyBatch: async ({ characterId }: { characterId: string }) => {
    state.batchCalls.push(characterId);
    return { batchId: `b-${characterId}`, status: "ready", generated: [{ ok: true }] };
  },
}));
vi.mock("@/lib/lifeState", () => ({ maybeCreateLifeEvent: async () => {} }));
vi.mock("@/lib/arcPlanner", () => ({ maybeAutoPlanArc: async () => null, getActiveArc: async () => null, getArcDayContext: () => null, arcContextBlock: () => "" }));

import { GET } from "@/app/api/characters/story/route";

beforeEach(() => {
  state.characters = [
    { id: "A", name: "Alpha", slug: "alpha", feature_flags: {} },
    { id: "V", name: "Vivienne", slug: "vivienne", feature_flags: {} },
  ];
  state.storyDayLookups = {};
  state.inserts = [];
  state.genFailFor = new Set();
  state.batchCalls = [];
});

describe("story route resilience (phase 6)", () => {
  it("first character's generation throws -> second character's day is still created and batched; 500 with per-character failure", async () => {
    state.genFailFor.add("A");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.failed).toEqual([{ character: "Alpha", error: expect.stringMatching(/parse failed/) }]);
    expect(state.inserts.map((i) => i.character_id)).toEqual(["V"]);
    expect(state.batchCalls).toEqual(["V"]);
    expect(body.processed[0]).toMatchObject({ character: "Vivienne", storyCreated: true, batchStatus: "ready" });
  });

  it("a day that appeared during generation is reused, never inserted twice", async () => {
    state.characters = [state.characters[1]];
    state.storyDayLookups.V = [null, { id: "sd-existing", day_number: 130, tier: "lived_moments", drift_seeds: [] }];
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.inserts).toEqual([]);
    expect(body.processed[0]).toMatchObject({ character: "Vivienne", day: 130, storyCreated: false });
    expect(state.batchCalls).toEqual(["V"]);
  });

  it("happy path unchanged: 200, one insert, batch run", async () => {
    state.characters = [state.characters[1]];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ character_id: "V", day_number: 130 });
  });
});

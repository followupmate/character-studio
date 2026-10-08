import { describe, it, expect, vi } from "vitest";

// Phase 6 — situation mode (open_life_generation_v1) makes up to SITUATION_MAX_ATTEMPTS sequential
// Sonnet calls BEFORE the story-day insert. With a deadline the loop stops early and the day is still
// returned (situation nulled, meta "validation_exhausted") instead of being killed by the 300 s limit.

vi.mock("@/lib/supabase", () => ({ supabase: { from: () => { throw new Error("db not expected"); } } }));
vi.mock("@/lib/generatePrompts", () => ({ claudeWithRetry: async () => { throw new Error("real Claude not expected"); } }));
vi.mock("@/lib/storyTier", async (orig) => ({
  ...(await orig<typeof import("@/lib/storyTier")>()),
  pickDriftSeeds: async () => [],
}));
vi.mock("@/lib/situationMemory", async (orig) => ({
  ...(await orig<typeof import("@/lib/situationMemory")>()),
  getSituationMemory: async () => [],
}));
vi.mock("@/lib/lifeState", async (orig) => ({
  ...(await orig<typeof import("@/lib/lifeState")>()),
  getActiveLifeEvents: async () => [],
  getLatestLifeState: async () => null,
}));

import { generateStoryDayContent, type ClaudeCallFn } from "./storyGeneration";
import { SITUATION_MAX_ATTEMPTS } from "./situationValidation";
import type { Character } from "@/types";

const character = {
  id: "c1", name: "Vivienne", slug: "vivienne", soul_id: null, photo_url: null, visual_tone: null, prompt_doctrine: null,
  styling_note: null, visual_brief: "x", backstory: "y", personality: {}, platforms: ["instagram"], posting_time: "10:00",
  is_active: true, created_at: "2026-01-01", lora_model_id: null, lora_trigger_word: null, lora_provider: null,
  feature_flags: { open_life_generation_v1: true },
} as unknown as Character;

// parseable, but no scene.situation -> every attempt is "situation missing" -> retry
const NO_SITUATION = JSON.stringify({ location: "terrace", mood: "m", narrative: "n", arc_position: "quiet", ig_caption: "c", hashtags: [] });

function fakeClaude(onCall?: () => void): ClaudeCallFn & { calls: number } {
  const fn = (async () => {
    fn.calls++;
    onCall?.();
    return { content: [{ type: "text", text: NO_SITUATION }] };
  }) as unknown as ClaudeCallFn & { calls: number };
  fn.calls = 0;
  return fn;
}

const base = { character, dayNumber: 130, targetDate: "2026-10-08", historyRows: [], forceTier: "everyday_life" as const };

describe("generateStoryDayContent — situation-mode deadline", () => {
  it("without a deadline: all SITUATION_MAX_ATTEMPTS attempts (unchanged)", async () => {
    const claude = fakeClaude();
    const r = await generateStoryDayContent({ ...base, claudeCall: claude });
    expect(claude.calls).toBe(SITUATION_MAX_ATTEMPTS);
    expect(r.situationValidated).toBe(false);
  });

  it("each attempt ~80 s, 200 s budget -> stops after 2 attempts and still returns a saveable day", async () => {
    let t = 0;
    const claude = fakeClaude(() => { t += 80_000; });
    const r = await generateStoryDayContent({ ...base, claudeCall: claude, now: () => t, deadlineAt: 200_000 });
    expect(claude.calls).toBe(2);
    expect(r.story.location).toBe("terrace");
    const meta = (r.story.scene as { situation: unknown; situation_planner_meta: { status: string; attempts: number; blocking_errors: string[] } });
    expect(meta.situation).toBeNull();
    expect(meta.situation_planner_meta.status).toBe("validation_exhausted");
    expect(meta.situation_planner_meta.attempts).toBe(2);
    expect(meta.situation_planner_meta.blocking_errors.join(" ")).toMatch(/time budget/);
  });
});

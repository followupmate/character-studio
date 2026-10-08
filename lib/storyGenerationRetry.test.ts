import { describe, it, expect, vi } from "vitest";

// Phase 6 — the daily story run must persist a day instead of 500-ing on one truncated reply, and
// must stop retrying before the 300 s Vercel limit kills it pre-insert.

vi.mock("@/lib/supabase", () => ({ supabase: { from: () => { throw new Error("db not expected"); } } }));
vi.mock("@/lib/generatePrompts", () => ({ claudeWithRetry: async () => { throw new Error("real Claude not expected"); } }));
vi.mock("@/lib/storyTier", async (orig) => ({
  ...(await orig<typeof import("@/lib/storyTier")>()),
  pickDriftSeeds: async () => [],
  pickTier: async () => "everyday_life",
}));

import { generateStoryDayContent, hasTimeForAnotherAttempt, tryParseStoryJson, STORY_ATTEMPT_RESERVE_MS, type ClaudeCallFn } from "./storyGeneration";
import type { Character } from "@/types";

const character = {
  id: "c1", name: "Vivienne", slug: "vivienne", soul_id: null, photo_url: null, visual_tone: null, prompt_doctrine: null,
  styling_note: null, visual_brief: "x", backstory: "y", personality: {}, platforms: ["instagram"], posting_time: "10:00",
  is_active: true, created_at: "2026-01-01", lora_model_id: null, lora_trigger_word: null, lora_provider: null, feature_flags: {},
} as unknown as Character;

const GOOD = JSON.stringify({ location: "her kitchen", mood: "slow", narrative: "n", arc_position: "quiet", ig_caption: "slow on purpose.", hashtags: ["slowmorning"] });
const TRUNCATED = GOOD.slice(0, 40);

function fakeClaude(replies: string[]): ClaudeCallFn & { calls: number } {
  const fn = (async () => {
    const text = replies[Math.min(fn.calls, replies.length - 1)];
    fn.calls++;
    return { content: [{ type: "text", text }] };
  }) as unknown as ClaudeCallFn & { calls: number };
  fn.calls = 0;
  return fn;
}

const base = { character, dayNumber: 130, targetDate: "2026-10-08", historyRows: [], forceTier: "everyday_life" as const };

describe("pure helpers", () => {
  it("hasTimeForAnotherAttempt: no deadline = unlimited; otherwise needs the reserve", () => {
    expect(hasTimeForAnotherAttempt(1_000, undefined)).toBe(true);
    expect(hasTimeForAnotherAttempt(0, STORY_ATTEMPT_RESERVE_MS)).toBe(true);
    expect(hasTimeForAnotherAttempt(1, STORY_ATTEMPT_RESERVE_MS)).toBe(false);
  });
  it("tryParseStoryJson never throws", () => {
    expect(tryParseStoryJson("```json\n" + GOOD + "\n```")).toMatchObject({ ok: true });
    expect(tryParseStoryJson(TRUNCATED)).toMatchObject({ ok: false });
    expect(tryParseStoryJson("[1,2]")).toMatchObject({ ok: false });
  });
});

describe("generateStoryDayContent — parse retry + deadline (non-situation day)", () => {
  it("valid first reply -> one call (unchanged behaviour)", async () => {
    const claude = fakeClaude([GOOD]);
    const r = await generateStoryDayContent({ ...base, claudeCall: claude });
    expect(claude.calls).toBe(1);
    expect(r.story.ig_caption).toBe("slow on purpose.");
  });

  it("one truncated reply no longer kills the day: retried once and saved", async () => {
    const claude = fakeClaude([TRUNCATED, GOOD]);
    const r = await generateStoryDayContent({ ...base, claudeCall: claude });
    expect(claude.calls).toBe(2);
    expect(r.story.location).toBe("her kitchen");
  });

  it("two unparseable replies -> throws the parse error (nothing to save)", async () => {
    const claude = fakeClaude([TRUNCATED, TRUNCATED]);
    await expect(generateStoryDayContent({ ...base, claudeCall: claude })).rejects.toThrow(/Story JSON parse failed/);
    expect(claude.calls).toBe(2);
  });

  it("past the deadline it does not start another attempt", async () => {
    const claude = fakeClaude([TRUNCATED, GOOD]);
    const now = () => 1_000_000;
    await expect(generateStoryDayContent({ ...base, claudeCall: claude, now, deadlineAt: 1_000_000 + 10_000 })).rejects.toThrow(/parse failed/);
    expect(claude.calls).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./storyGeneration";
import type { Character } from "@/types";

// generateStoryDayContent() itself is DB-bound (pickTier/pickDriftSeeds/getActiveLifeEvents/
// getSituationMemory all call supabase) and, per house convention (see pickTier/getGrowthBias/
// getLatestLifeState — none of which are unit tested either), is exercised via the manual
// verification plan (generate-forward dry runs), not vitest. buildSystemPrompt() is the pure
// half and is fully covered here.

function fixtureCharacter(): Character {
  return {
    id: "char-1",
    name: "Vivienne",
    slug: "vivienne",
    soul_id: "soul-1",
    photo_url: null,
    visual_tone: null,
    prompt_doctrine: null,
    styling_note: null,
    visual_brief: "A warm, present young woman.",
    backstory: "Grew up between two cities.",
    personality: { warmth: "high" },
    platforms: ["instagram"],
    posting_time: "18:00",
    is_active: true,
    created_at: "2026-01-01",
    lora_model_id: null,
    lora_trigger_word: null,
    lora_provider: null,
  };
}

describe("buildSystemPrompt — flag-off backward compatibility", () => {
  it("omitting every open_life_generation_v1 field produces no situation-related content", () => {
    const prompt = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "lived_moments",
      driftSeeds: [],
      dayNumber: 5,
      historyText: "First day. No history yet.",
    });
    expect(prompt).not.toMatch(/situation:/i);
    expect(prompt).not.toMatch(/SITUATION MODE OVERRIDE/);
    expect(prompt).not.toMatch(/SITUATION FIRST/);
  });

  it("is deterministic for identical args", () => {
    const args = {
      character: fixtureCharacter(),
      tier: "everyday_life" as const,
      driftSeeds: [],
      dayNumber: 1,
      historyText: "First day. No history yet.",
    };
    expect(buildSystemPrompt(args)).toBe(buildSystemPrompt(args));
  });

  it("still carries the VOICE ANCHOR drift-reset line (the story/route.ts baseline this was extracted from)", () => {
    const prompt = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "wellness_fitness",
      driftSeeds: [],
      dayNumber: 2,
      historyText: "First day. No history yet.",
    });
    expect(prompt).toMatch(/VOICE ANCHOR/);
    expect(prompt).toMatch(/IGNORE THE DRIFT/);
  });

  it("still includes the full ig_caption/hook_text tier examples (the fuller version generate-forward's old copy had drifted without)", () => {
    const prompt = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "intimate_aesthetic",
      driftSeeds: [],
      dayNumber: 3,
      historyText: "First day. No history yet.",
    });
    expect(prompt).toContain("the mirror in here is doing something illegal");
  });

  it("includes LIFE_OUTPUT_SPEC only when lifeContext is provided", () => {
    const without = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "everyday_life",
      driftSeeds: [],
      dayNumber: 1,
      historyText: "x",
    });
    expect(without).not.toMatch(/life_state: object/);

    const withLife = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "everyday_life",
      driftSeeds: [],
      dayNumber: 1,
      historyText: "x",
      lifeContext: "LIFE STATE (continuity context...)",
    });
    expect(withLife).toMatch(/life_state: object/);
  });
});

describe("buildSystemPrompt — situationMode on", () => {
  it("adds the location override line and passes the situationOutputSpec text through", () => {
    const prompt = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "intimate_aesthetic",
      driftSeeds: [],
      dayNumber: 4,
      historyText: "x",
      situationMode: true,
      situationOutputSpec: "SITUATION_SPEC_MARKER_ABC",
    });
    expect(prompt).toContain("SITUATION MODE OVERRIDE");
    expect(prompt).toContain("SITUATION_SPEC_MARKER_ABC");
  });

  it("threads situationMode into tierGuidance, restructuring intimate_aesthetic to situation-first", () => {
    const prompt = buildSystemPrompt({
      character: fixtureCharacter(),
      tier: "intimate_aesthetic",
      driftSeeds: [],
      dayNumber: 4,
      historyText: "x",
      situationMode: true,
    });
    expect(prompt).toMatch(/SITUATION FIRST/);
  });

  it("everything else (backstory, visual brief, personality, history) is unaffected by situationMode", () => {
    const base = {
      character: fixtureCharacter(),
      tier: "everyday_life" as const,
      driftSeeds: [],
      dayNumber: 4,
      historyText: "Day 3: her kitchen — easy — a quiet morning.",
    };
    const off = buildSystemPrompt(base);
    const on = buildSystemPrompt({ ...base, situationMode: true });
    expect(off).toContain(base.historyText);
    expect(on).toContain(base.historyText);
    expect(off.split("CHARACTER BACKSTORY")[1]?.split("VISUAL BRIEF")[0]).toBe(
      on.split("CHARACTER BACKSTORY")[1]?.split("VISUAL BRIEF")[0]
    );
  });
});

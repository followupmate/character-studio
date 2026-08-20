import { describe, expect, it } from "vitest";
import { buildAutoSpeechPrompt, resolvePerformanceDescriptor, resolveVideoIntentPerformance } from "./performanceTransformer";
import type { PromptDirectorInput } from "./types";
import type { SceneBriefJson } from "@/lib/sceneBrief";

// All tests here exercise pure functions only — no claudeWithRetry call, same convention as
// lib/sceneBrief.test.ts / lib/slotPrompts.test.ts (which test the deterministic prompt-
// construction layer beneath the LLM call, never the call itself).

describe("resolvePerformanceDescriptor", () => {
  it("translates a known abstract term into 1-3 observable behaviors", () => {
    const result = resolvePerformanceDescriptor("confident");
    expect(result?.source).toBe("deterministic");
    expect(result?.observableBehaviors.length).toBeGreaterThan(0);
    expect(result?.observableBehaviors.length).toBeLessThanOrEqual(3);
  });

  it("returns unresolved for text with no known abstract term", () => {
    const result = resolvePerformanceDescriptor("she picks up the cup and takes a sip");
    expect(result?.source).toBe("unresolved");
    expect(result?.observableBehaviors).toEqual([]);
  });

  it("returns null for empty input", () => {
    expect(resolvePerformanceDescriptor(undefined)).toBeNull();
    expect(resolvePerformanceDescriptor("")).toBeNull();
  });
});

describe("resolveVideoIntentPerformance", () => {
  it("grounds a bare abstract action word", () => {
    const resolved = resolveVideoIntentPerformance({ mode: "motion_only", action: "playful" });
    expect(resolved.action).not.toBe("playful");
    expect(resolved.action).toContain("half-smile");
  });

  it("leaves an already-concrete action sentence untouched", () => {
    const concrete = "she shifts her weight onto one leg, turns her head slightly toward the lens";
    const resolved = resolveVideoIntentPerformance({ mode: "motion_only", action: concrete });
    expect(resolved.action).toBe(concrete);
  });

  it("grounds emotionalDelivery when it matches a known term", () => {
    const resolved = resolveVideoIntentPerformance({ mode: "talking_to_camera", emotionalDelivery: "sensual" });
    expect(resolved.emotionalDelivery).toContain("unhurried gaze");
  });

  it("does not touch fields that are already absent", () => {
    const resolved = resolveVideoIntentPerformance({ mode: "motion_only" });
    expect(resolved.action).toBeUndefined();
    expect(resolved.emotionalDelivery).toBeUndefined();
  });
});

const SCENE_BRIEF: SceneBriefJson = {
  camera_language: "static handheld",
  color_palette: ["terracotta"],
  visual_rules: [],
  location_constraints: [],
  spatial_setup: "Her bathroom — pale tile, single mirror, warm bulb overhead.",
  wardrobe_lock: "oversized tee",
  allowed_props: [],
  lighting_state: "warm bulb overhead",
  time_of_day: "night",
  weather_implied: "indoor",
};

function baseInput(): PromptDirectorInput {
  return {
    character: { id: "c1", name: "Vivienne", visualBrief: "late-20s woman", sacredDetails: null },
    sceneBrief: SCENE_BRIEF,
    slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "Talking selfie." },
    archetypeId: "gesture_motion",
    archetypeGuidance: "",
    outputType: "talking_video",
    generationMode: "image_to_video",
    targetModel: "seedance",
  };
}

describe("buildAutoSpeechPrompt", () => {
  it("caps the requested word count to what the clip duration can hold", () => {
    const short = buildAutoSpeechPrompt(baseInput(), 3);
    const long = buildAutoSpeechPrompt(baseInput(), 12);
    const shortMax = Number(short.system.match(/Maximum (\d+) words/)?.[1]);
    const longMax = Number(long.system.match(/Maximum (\d+) words/)?.[1]);
    expect(shortMax).toBeLessThan(longMax);
  });

  it("never asks for hashtags/caption-speak", () => {
    const { system } = buildAutoSpeechPrompt(baseInput(), 6);
    expect(system).toMatch(/No hashtags/);
  });

  it("includes the actual scene so the line isn't generic", () => {
    const { system } = buildAutoSpeechPrompt(baseInput(), 6);
    expect(system).toContain("Her bathroom");
  });
});

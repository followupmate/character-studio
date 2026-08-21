import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { plannedActionForReelArchetype, promptDirectorTargetForSlot } from "@/lib/dailyBatch";
import type { SlotSpec } from "@/lib/archetypeDeck";

// Production defect (found in review, before it ever shipped): PromptDirectorInput.plannedVideoIntent
// existed on the type from day one but nothing in lib/dailyBatch.ts ever set it — a reel_start_frame
// slot compiled through Prompt Director got no first-frame prep guidance at all (§21), even though
// the interface looked wired. A pure unit test can't observe this (TypeScript happily accepts a
// missing optional field), so this reads the actual source of generateSlotPromptViaDirector() the
// way lib/slotPrompts.test.ts's "truncation is reported" test does, to make a silent regression loud.
const src = readFileSync(new URL("./dailyBatch.ts", import.meta.url), "utf8");

describe("promptDirectorTargetForSlot", () => {
  function slot(overrides: Partial<SlotSpec>): SlotSpec {
    return { slot: "carousel_1", channel: "feed", type: "photo", sequence_index: 1, family: "environment", framing: "", ...overrides };
  }

  it("targets soul2/text_to_image for photo slots", () => {
    expect(promptDirectorTargetForSlot(slot({ type: "photo" }))).toEqual({
      outputType: "image",
      generationMode: "text_to_image",
      targetModel: "soul2",
    });
  });

  it("targets kling/image_to_video for the video slot", () => {
    expect(promptDirectorTargetForSlot(slot({ slot: "reel_video", type: "video", family: "motion" }))).toEqual({
      outputType: "video",
      generationMode: "image_to_video",
      targetModel: "kling",
    });
  });
});

describe("plannedVideoIntent is actually wired into the reel_start_frame compile call (§21)", () => {
  it("generateSlotPromptViaDirector() sets plannedVideoIntent for reel_start_frame", () => {
    const fn = src.slice(src.indexOf("async function generateSlotPromptViaDirector"), src.indexOf("export interface DailyBatchResult"));
    expect(fn).toMatch(/plannedVideoIntent:\s*\n?\s*args\.slot\.slot === "reel_start_frame"/);
  });

  it("does not set plannedVideoIntent for every slot unconditionally (only reel_start_frame)", () => {
    const fn = src.slice(src.indexOf("async function generateSlotPromptViaDirector"), src.indexOf("export interface DailyBatchResult"));
    expect(fn).toMatch(/mode:\s*"motion_only",\s*action:\s*plannedActionForReelArchetype\(args\.reelVideoArchetypeId\)/);
    expect(fn).toContain(": undefined,");
  });

  it("both runSlot() call sites in generateDailyBatch() thread archetypeMap[\"reel_video\"] through", () => {
    const matches = src.match(/reelVideoArchetypeId:\s*archetypeMap\["reel_video"\]/g) ?? [];
    expect(matches.length).toBe(2); // initial wave loop + retry loop
  });

  it("reconcileFailedSlots() looks up the reel_video sibling's archetype for a retried reel_start_frame", () => {
    const fn = src.slice(src.indexOf("export async function reconcileFailedSlots"));
    expect(fn).toMatch(/row\.slot === "reel_start_frame"/);
    expect(fn).toContain('.eq("slot", "reel_video")');
  });
});

describe("§22 fix — the reel_video slot's OWN videoIntent.action is wired (not just the sibling reel_start_frame's plannedVideoIntent)", () => {
  // Real-world finding (2026-08-22): a reel_video whose start frame clearly implied motion
  // (stepping out of a pool) rendered with a frozen body and only head/talking movement — because
  // plannedActionForReelArchetype() was ONLY ever wired into reel_start_frame's plannedVideoIntent
  // (prepping the still photo's pose), never into the reel_video slot's own compiled motion prompt.
  it("generateSlotPromptViaDirector() sets videoIntent.action from this slot's own archetype for every video-type slot", () => {
    const fn = src.slice(src.indexOf("async function generateSlotPromptViaDirector"), src.indexOf("export interface DailyBatchResult"));
    expect(fn).toMatch(/videoIntent:\s*\n?\s*args\.slot\.type === "video"/);
    expect(fn).toMatch(/mode:\s*"motion_only",\s*action:\s*plannedActionForReelArchetype\(args\.archetypeId\)/);
  });
});

describe("plannedActionForReelArchetype (§21 — deterministic, no LLM call)", () => {
  it("maps each of today's three motion archetypes to a concrete action, per their own semantics", () => {
    expect(plannedActionForReelArchetype("walking_motion")).toMatch(/walk/i);
    expect(plannedActionForReelArchetype("gesture_motion")).toMatch(/gesture/i);
    expect(plannedActionForReelArchetype("light_motion")).toMatch(/light shifts/i);
  });

  it("returns undefined for an archetype it doesn't know, rather than inventing one", () => {
    expect(plannedActionForReelArchetype("some_future_archetype")).toBeUndefined();
    expect(plannedActionForReelArchetype(undefined)).toBeUndefined();
  });
});

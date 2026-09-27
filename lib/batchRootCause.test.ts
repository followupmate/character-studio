import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { stripVideoModelTerms } from "@/lib/promptClean";
import { coherentReelVideoArchetype, SAFE_REEL_VIDEO_ARCHETYPE } from "@/lib/dailyBatch";

describe("stripVideoModelTerms", () => {
  it("drops sentences naming a video model, keeps the rest untouched", () => {
    const p = "A single natural photograph. Motion prompt for Kling i2v later. She glances back. Vertical 9:16.";
    expect(stripVideoModelTerms(p)).toBe("A single natural photograph. She glances back. Vertical 9:16.");
  });
  it("drops a Model: Kling video header line", () => {
    expect(stripVideoModelTerms("Model: Kling 🎬 Video Prompt\nShe sits in the car.")).toBe("She sits in the car.");
  });
  it("is a no-op on clean prompts", () => {
    const p = "Intimate close-up of her face, soft morning light.";
    expect(stripVideoModelTerms(p)).toBe(p);
  });
});

describe("coherentReelVideoArchetype", () => {
  const seatedCar = { spatial_setup: "She sits alone in the right-hand rear seat of a luxury grand-tourer, quilted leather." };
  it("swaps walking_motion for a seated scene (2026-09-26 failure)", () => {
    expect(coherentReelVideoArchetype("walking_motion", seatedCar, { sceneLocation: "rear cabin of a moving luxury car" })).toBe(SAFE_REEL_VIDEO_ARCHETYPE);
  });
  it("keeps walking_motion when the scene is locomotion", () => {
    expect(coherentReelVideoArchetype("walking_motion", { spatial_setup: "She walks down a cobblestone street." })).toBe("walking_motion");
  });
  it("never touches other archetypes", () => {
    expect(coherentReelVideoArchetype("gesture_motion", seatedCar)).toBe("gesture_motion");
  });
});

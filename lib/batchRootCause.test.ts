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

  // Phase 2 — generalised: reel recipes follow their requiredActionClasses.
  const street = { spatial_setup: "She walks down a cobblestone street, old stone walls on both sides." };
  const mirror = { spatial_setup: "She stands in front of a full-length mirror in the dressing area, linen wardrobe behind her." };
  const swimming = { spatial_setup: "She swims slow lengths in a pool." };
  it("keeps ootd_stop on a walking or standing scene, swaps it on a seated one", () => {
    expect(coherentReelVideoArchetype("ootd_stop", street, { sceneLocation: "street" })).toBe("ootd_stop");
    expect(coherentReelVideoArchetype("ootd_stop", mirror, { sceneLocation: "dressing room" })).toBe("ootd_stop");
    expect(coherentReelVideoArchetype("ootd_stop", seatedCar, { sceneLocation: "rear cabin of a moving luxury car" })).toBe(SAFE_REEL_VIDEO_ARCHETYPE);
  });
  it("keeps grwm_loading on a standing scene, swaps it on walking / swimming", () => {
    expect(coherentReelVideoArchetype("grwm_loading", mirror, { sceneLocation: "dressing room" })).toBe("grwm_loading");
    expect(coherentReelVideoArchetype("grwm_loading", street, { sceneLocation: "street" })).toBe(SAFE_REEL_VIDEO_ARCHETYPE);
    expect(coherentReelVideoArchetype("grwm_loading", swimming, { sceneLocation: "pool" })).toBe(SAFE_REEL_VIDEO_ARCHETYPE);
  });
  it("is a no-op without a brief", () => {
    expect(coherentReelVideoArchetype("ootd_stop", null)).toBe("ootd_stop");
    expect(coherentReelVideoArchetype(undefined, street)).toBeUndefined();
  });
});

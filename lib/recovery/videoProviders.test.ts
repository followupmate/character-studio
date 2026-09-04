import { describe, it, expect } from "vitest";
import {
  attemptableProviders,
  noProviderAvailableReason,
  planRecoveryVideoProviders,
  RECOVERY_PROVIDER_CAPABILITY,
  RECOVERY_VIDEO_PROVIDER_CHAIN,
  resolveDurationForProvider,
} from "@/lib/recovery/videoProviders";
import { REEL_DURATION_GATE } from "@/lib/recovery/reelDuration";

const BOTH = { FAL_API_KEY: "fal-key", GOOGLE_API_KEY: "google-key" };
const FAL_ONLY = { FAL_API_KEY: "fal-key", GOOGLE_API_KEY: "" };
const NONE = { FAL_API_KEY: "", GOOGLE_API_KEY: "" };

describe("recovery video provider chain", () => {
  it("is kling -> seedance-i2v -> veo, in that order", () => {
    expect(RECOVERY_VIDEO_PROVIDER_CHAIN).toEqual(["kling", "seedance-i2v", "veo"]);
  });

  it("marks veo as last-resort-only and the other two as not", () => {
    expect(RECOVERY_PROVIDER_CAPABILITY.veo.lastResortOnly).toBe(true);
    expect(RECOVERY_PROVIDER_CAPABILITY.kling.lastResortOnly).toBe(false);
    expect(RECOVERY_PROVIDER_CAPABILITY["seedance-i2v"].lastResortOnly).toBe(false);
  });

  it("never puts veo first, whatever the target duration", () => {
    for (const target of [4, 6, 7, 8, 10]) {
      expect(planRecoveryVideoProviders(target, BOTH)[0].provider).toBe("kling");
    }
  });
});

describe("duration translation is per provider capability", () => {
  it("hits 8s exactly on all three — verified against the fal generated types", () => {
    for (const p of RECOVERY_VIDEO_PROVIDER_CHAIN) {
      const r = resolveDurationForProvider(p, 8);
      expect(r.durationSec, p).toBe(8);
      expect(r.exact, p).toBe(true);
      expect(r.note, p).toBeUndefined();
    }
  });

  it("translates 7s: kling and seedance exact, veo cannot and says so", () => {
    expect(resolveDurationForProvider("kling", 7)).toMatchObject({ durationSec: 7, exact: true });
    expect(resolveDurationForProvider("seedance-i2v", 7)).toMatchObject({ durationSec: 7, exact: true });
    const veo = resolveDurationForProvider("veo", 7);
    // Veo has only 4/6/8 — 6 and 8 are equidistant from 7, and the tie goes to the longer one.
    expect(veo.durationSec).toBe(8);
    expect(veo.exact).toBe(false);
    expect(veo.note).toMatch(/cannot render 7s; nearest supported is 8s/);
  });

  it("breaks ties toward the longer option", () => {
    // A short reel caps avg watch time outright — nine ~5.2s reels, none above 3.10s watch.
    expect(resolveDurationForProvider("veo", 5).durationSec).toBe(6);
    expect(resolveDurationForProvider("veo", 7).durationSec).toBe(8);
  });

  it("clamps a target below or above what a provider offers", () => {
    expect(resolveDurationForProvider("kling", 1).durationSec).toBe(3);
    expect(resolveDurationForProvider("kling", 40).durationSec).toBe(15);
    expect(resolveDurationForProvider("seedance-i2v", 1).durationSec).toBe(4);
  });

  it("does not consult the QA gate when choosing — the gate checks output, it does not route", () => {
    // Kling's range includes 10s and 3s, both outside the gate. Translation must still be driven
    // purely by the target and the provider's capability.
    expect(resolveDurationForProvider("kling", 10).durationSec).toBe(10);
    expect(REEL_DURATION_GATE.maxSec).toBeLessThan(10);
    expect(resolveDurationForProvider("kling", 3).durationSec).toBe(3);
  });
});

describe("availability", () => {
  it("runs the whole chain when both keys are present", () => {
    expect(attemptableProviders(planRecoveryVideoProviders(8, BOTH)).map((p) => p.provider)).toEqual([
      "kling",
      "seedance-i2v",
      "veo",
    ]);
  });

  it("GOOGLE_API_KEY is NOT a blocker — kling and seedance still run without it", () => {
    const plan = planRecoveryVideoProviders(8, FAL_ONLY);
    const attempts = attemptableProviders(plan);
    expect(attempts.map((p) => p.provider)).toEqual(["kling", "seedance-i2v"]);
    expect(attempts.length).toBeGreaterThan(0);
    expect(plan.find((p) => p.provider === "veo")!.unavailableReason).toBe("GOOGLE_API_KEY is not set");
  });

  it("yields nothing attemptable when no video key exists, with a reason naming each provider", () => {
    const plan = planRecoveryVideoProviders(8, NONE);
    expect(attemptableProviders(plan)).toEqual([]);
    const reason = noProviderAvailableReason(plan);
    expect(reason).toMatch(/kling: FAL_API_KEY is not set/);
    expect(reason).toMatch(/seedance-i2v: FAL_API_KEY is not set/);
    expect(reason).toMatch(/veo: GOOGLE_API_KEY is not set/);
    expect(reason).toMatch(/never rendered by an image generator/);
  });

  it("treats a whitespace-only key as absent", () => {
    expect(attemptableProviders(planRecoveryVideoProviders(8, { FAL_API_KEY: "   ", GOOGLE_API_KEY: "" }))).toEqual([]);
  });
});

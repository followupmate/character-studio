import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { capKlingDuration, isContentPolicyRefusal, refusalMessage, KLING_MAX_DURATION_SEC } from "./videoCost";

describe("videoCost", () => {
  it("caps Kling at 8 s", () => {
    expect(KLING_MAX_DURATION_SEC).toBe(8);
    expect(capKlingDuration(10)).toBe(8);
    expect(capKlingDuration(15)).toBe(8);
    expect(capKlingDuration(undefined)).toBe(8);
    expect(capKlingDuration(5)).toBe(5);
    expect(capKlingDuration(1)).toBe(3);
  });
  it("detects refusals, old and new labels", () => {
    expect(isContentPolicyRefusal("content_policy_violation: x")).toBe(true);
    expect(isContentPolicyRefusal("partner_validation_failed")).toBe(true);
    expect(isContentPolicyRefusal("Seedance zamietol tento konkrétny záber (content policy — anti-deepfake kontrola).")).toBe(true);
    expect(isContentPolicyRefusal(refusalMessage("fal-ai/kling-video/v3/pro/image-to-video"))).toBe(true);
    expect(isContentPolicyRefusal("timeout")).toBe(false);
    expect(isContentPolicyRefusal(null)).toBe(false);
  });
  it("names the real model", () => {
    expect(refusalMessage("fal-ai/kling-video/v3/pro/image-to-video")).toMatch(/^Kling /);
    expect(refusalMessage("bytedance/seedance-2.0/image-to-video")).toMatch(/^Seedance /);
  });
  it("no Kling path asks for 10 s; reconcile + auto-media guards wired", () => {
    const va = readFileSync("app/api/characters/video-async/route.ts", "utf8");
    expect(va).not.toMatch(/duration: "10"/);
    expect(readFileSync("lib/klingProvider.ts", "utf8")).toContain("capKlingDuration(");
    const db = readFileSync("lib/dailyBatch.ts", "utf8");
    expect(db).toMatch(/isContentPolicyRefusal\(r\.last_error\)/);
    expect(readFileSync("app/api/characters/auto-media/route.ts", "utf8")).toContain('"skip_auto_reel_video"');
  });
});

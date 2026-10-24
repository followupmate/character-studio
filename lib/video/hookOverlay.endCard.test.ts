import { describe, expect, it } from "vitest";
import { buildOverlayFfmpegArgs, stripEmoji, END_CARD } from "./hookOverlay";
import { reelHookOverrideFor } from "@/lib/reelHookOverrides";
import { readReelRecipeMarker } from "@/lib/recovery/reelRecipes";

describe("end card", () => {
  it("argv is unchanged without an end card", () => {
    const a = buildOverlayFfmpegArgs({ inputVideo: "i.mp4", overlayPng: "o.png", output: "x.mp4" });
    expect(a.filter((x) => x === "-i")).toHaveLength(2);
    expect(a.join(" ")).not.toContain("[ec]");
  });
  it("adds a third input delayed to endStartSec", () => {
    const a = buildOverlayFfmpegArgs({ inputVideo: "i.mp4", overlayPng: "o.png", output: "x.mp4", endPng: "e.png", endStartSec: 6.5 });
    expect(a.filter((x) => x === "-i")).toHaveLength(3);
    const f = a[a.indexOf("-filter_complex") + 1];
    expect(f).toContain("setpts=PTS+6.50/TB[ec]");
    expect(f).toContain(`fade=t=in:st=0:d=${END_CARD.fadeIn}`);
  });
  it("strips emoji incl. ZWJ sequences", () => {
    expect(stripEmoji("next: construction site 👷‍♀️")).toBe("next: construction site");
    expect(stripEmoji("next: surfing 🌊")).toBe("next: surfing");
  });
  it("override + marker carry end_text; absent stays absent", () => {
    const flags = { reel_hook_overrides: { "2026-10-26": { hook_text: "day 5: boxing. never done this", end_text: "next: surfing" }, "2026-10-27": { hook_text: "x y" } } };
    expect(reelHookOverrideFor(flags, "2026-10-26")?.end_text).toBe("next: surfing");
    expect(reelHookOverrideFor(flags, "2026-10-27")?.end_text).toBeNull();
    const sig = { reel_recipe: { id: "tries_episode", hook_text: "a b", end_text: "next: surfing" } };
    expect(readReelRecipeMarker(sig)?.end_text).toBe("next: surfing");
    expect(readReelRecipeMarker({ reel_recipe: { id: "tries_episode", hook_text: "a b" } })).not.toHaveProperty("end_text");
  });
});

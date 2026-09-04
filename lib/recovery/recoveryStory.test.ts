import { describe, it, expect } from "vitest";
import { buildRecoveryStoryScene, findLocationLeaks, recoveryTierFor } from "@/lib/recovery/recoveryStory";
import { compileRecoveryDays } from "@/lib/recovery/recoveryDays";
import { STORY_COPY_RULES } from "@/lib/storyCopyRules";

const days = compileRecoveryDays();

describe("the recovery scene becomes the story day", () => {
  it("derives the day's scene from the same brief that produced the reel", () => {
    // This is the whole fix: one brief, one scene, so the caption cannot describe somewhere the
    // video is not. The first integration grafted a bedroom reel onto a Positano travel day and a
    // #positanoitaly caption was scheduled to publish over it.
    for (const d of days) {
      const scene = buildRecoveryStoryScene(d);
      expect(scene.location, `#${d.slot}`).toBeTruthy();
      expect(d.brief.spatial_setup).toContain(scene.location.split(",")[0].slice(0, 20));
      expect(scene.scene.wardrobe).toBe(d.brief.wardrobe_lock);
      expect(scene.scene.time_of_day).toBe(d.brief.time_of_day);
      expect(scene.scene.recovery_index).toBe(d.slot);
    }
  });

  it("names no location the brief does not contain", () => {
    for (const d of days) {
      const scene = buildRecoveryStoryScene(d);
      for (const place of ["Positano", "Naples", "Amalfi", "Tyrrhenian"]) {
        expect(scene.location, `#${d.slot}`).not.toContain(place);
      }
    }
  });

  it("maps every direction onto an EXISTING tier — no new tier invented", () => {
    const known = new Set([
      "intimate_aesthetic",
      "wellness_fitness",
      "lived_moments",
      "lifestyle_travel",
      "everyday_life",
      "luxe_car",
    ]);
    for (const d of days) expect(known.has(recoveryTierFor(d)), `#${d.slot}`).toBe(true);
  });

  it("gives the intimate pair the same tier and the others their own", () => {
    const byIndex = new Map(days.map((d) => [d.slot, recoveryTierFor(d)]));
    // #1 and #4 are the deliberate same-register pair
    expect(byIndex.get(1)).toBe("intimate_aesthetic");
    expect(byIndex.get(4)).toBe("intimate_aesthetic");
    expect(byIndex.get(2)).toBe("wellness_fitness");
    expect(byIndex.get(3)).toBe("lived_moments");
  });
});

describe("findLocationLeaks", () => {
  const forbidden = ["Positano", "Naples", "Amalfi"];

  it("catches a stale place name in the caption, the hashtags or the hook", () => {
    expect(
      findLocationLeaks({ ig_caption: "last morning in positano.", hashtags: [], hook_text: null, next_hint: "" }, forbidden)
    ).toEqual(["Positano"]);
    expect(
      findLocationLeaks({ ig_caption: "quiet one.", hashtags: ["amalficoast", "slowliving"], hook_text: null, next_hint: "" }, forbidden)
    ).toEqual(["Amalfi"]);
    expect(
      findLocationLeaks({ ig_caption: "quiet one.", hashtags: [], hook_text: "naples at dusk", next_hint: "" }, forbidden)
    ).toEqual(["Naples"]);
  });

  it("passes copy that stays inside its own scene", () => {
    expect(
      findLocationLeaks(
        { ig_caption: "the chain and the quiet.", hashtags: ["slowliving", "bedroomaesthetic"], hook_text: null, next_hint: "" },
        forbidden
      )
    ).toEqual([]);
  });

  it("ignores terms too short to be a real place, so it cannot false-positive", () => {
    expect(findLocationLeaks({ ig_caption: "the sea.", hashtags: [], hook_text: null, next_hint: "" }, ["Sea", "A"])).toEqual([]);
  });
});

describe("caption rules are shared, not duplicated", () => {
  it("recovery copy uses the same rule text the story engine does", () => {
    // A recovery caption obeying slightly different voice rules than every other day is its own
    // quiet inconsistency. Both callers import this one string.
    expect(STORY_COPY_RULES).toContain("ig_caption");
    expect(STORY_COPY_RULES).toContain("hook_text");
    expect(STORY_COPY_RULES).toContain("hashtags");
    expect(STORY_COPY_RULES.length).toBeGreaterThan(400);
  });
});

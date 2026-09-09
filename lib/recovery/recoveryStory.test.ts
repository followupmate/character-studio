import { describe, it, expect } from "vitest";
import { buildRecoveryStoryScene, findLocationLeaks, findPersonLeaks, recoveryTierFor } from "@/lib/recovery/recoveryStory";
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

describe("findPersonLeaks", () => {
  const copy = (ig_caption: string, hook_text: string | null = null) => ({
    ig_caption,
    hashtags: [],
    hook_text,
    next_hint: "",
  });

  it("catches the caption that started this rule", () => {
    // Real output from the first VHD dry run, 2026-09-09. It narrates her from outside AND puts a
    // second person in a scene whose visual rules say "one sharp face only, no foreground
    // companion" — the copy would have described someone the video is built not to contain.
    const leaks = findPersonLeaks(
      copy("somewhere between the first glass and deciding to stay for another. her eyes came back and so did mine.")
    );
    expect(leaks).toContain("her");
  });

  it("catches an invented companion", () => {
    expect(findPersonLeaks(copy("we stayed for one more."))).toContain("we");
    expect(findPersonLeaks(copy("he ordered for both of us."))).toEqual(expect.arrayContaining(["he", "us"]));
  });

  it("passes the account's own voice", () => {
    // Twenty-five consecutive real captions from chs_story_days, read 2026-09-09. Every one is
    // first-person singular or impersonal. If this rule would have rejected any of them it is the
    // wrong rule, so they are the calibration set rather than invented examples.
    const real = [
      "said yes to an address on a scrap of paper. naples at dusk, campari, no plans after this. still not looking at flights",
      "hand in the water, then not. that was the whole decision.",
      "adjusted the chain and decided that was enough for today.",
      "one espresso. no rush. the morning earns itself.",
      "up before the city. just me, warm concrete, and a strand of hair that keeps escaping.",
      "lamp on, curtain half-drawn, chain caught the light. the rest of the evening is mine",
      "went down before the heat. positano belongs to early risers and i plan to keep it that way.",
      "got to the pool before anyone else. stayed there until I had no excuse not to.",
      "positano, day one. walked straight through the suite to the terrace. the key card is still in my hand.",
      "back after a few days off. the mirror remembers before you do.",
      "said yes before i thought about it. the city at this hour made that easy.",
      "checked out an hour ago. already at the flower stall. the list can wait another five minutes.",
      "asked for late checkout before i even unpacked. the pool was reason enough. still here",
      "the night had its own plans. i just got in the car.",
      "two hours in. the light changed and somehow i'm still here.",
      "finally said it out loud. the city took it well",
      "ordered the drink before i found a chair. that's how you know the afternoon is going to be fine.",
      "the gym bag won. finally.",
      "only stopped in for one. the light made that impossible to stick to.",
      "packed for the gym. ended up here. close enough.",
      "didn't plan the flowers. they were just there and the color was right.",
      "finally did the solo cafe morning i kept promising myself. still not telling anyone why i'm smiling.",
      "good news arrived. put the phone down. staying here with it for a minute",
      "said one drink. the city had other plans.",
      "here most days if this is your kind of afternoon.",
    ];
    for (const c of real) expect(findPersonLeaks(copy(c)), c).toEqual([]);
  });

  it("does not treat addressing the viewer as a second person in the scene", () => {
    // "your kind of morning" is this account's standard sign-off and must survive.
    expect(findPersonLeaks(copy("here most days if this is your kind of quiet."))).toEqual([]);
  });

  it("allows she/her back when the day's brief actually has an animal in it", () => {
    const c = copy("brought the cat flowers. she's not impressed. the ranunculus are though.");
    expect(findPersonLeaks(c)).toContain("she");
    expect(findPersonLeaks(c, { petInScene: true })).toEqual([]);
  });

  it("checks the hook as well as the caption", () => {
    expect(findPersonLeaks(copy("quiet one.", "he waited"))).toContain("he");
  });
});

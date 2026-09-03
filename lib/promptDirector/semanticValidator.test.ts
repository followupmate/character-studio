import { describe, it, expect } from "vitest";
import { validateSceneCoherence } from "@/lib/promptDirector/semanticValidator";
import { RECOVERY_FIXTURES } from "@/lib/promptDirector/recoveryFixtures";
import {
  ambiencePhraseForLocation,
  classifyAction,
  classifyLocation,
  resolveSceneSemantics,
  stripNegations,
} from "@/lib/sceneSemantics";

// RECOVERY phase 3 eval. Fails the build until the validator gets all eight real production reels
// right: Days 88–93 must each raise at least one error, Days 76 and 78 must come through clean.

function runFixture(f: (typeof RECOVERY_FIXTURES)[number]) {
  return validateSceneCoherence({
    brief: {
      spatial_setup: f.spatialSetup,
      allowed_props: f.allowedProps,
      wardrobe_lock: f.wardrobeLock,
    },
    prompt: f.prompt,
    archetypeId: f.archetypeId,
    sceneLocation: f.location,
    enforceAutoReelShape: true,
  });
}

describe("stripNegations", () => {
  it("drops negated clauses so exclusions cannot be read as inclusions", () => {
    expect(stripNegations("terracotta tile, no table, no chairs, no pool, the sea beyond")).not.toMatch(/pool/i);
    expect(stripNegations("cobblestones underfoot, no parked cars in the foreground")).not.toMatch(/\bcars\b/i);
    // and it must not eat the positive content around them
    expect(stripNegations("terracotta tile, no table, the sea beyond")).toMatch(/terracotta tile/);
    expect(stripNegations("terracotta tile, no table, the sea beyond")).toMatch(/the sea beyond/);
  });
});

describe("classifyLocation on the real production briefs", () => {
  const cases: Array<[number, string]> = [
    [76, "terrace_rooftop"],
    [78, "bedroom"],
    [88, "car_interior"],
    [89, "pool"],
    [90, "street"],
    [91, "terrace_rooftop"],
    [92, "studio_gym"],
    [93, "terrace_rooftop"],
  ];
  for (const [day, expected] of cases) {
    it(`day ${day} -> ${expected}`, () => {
      const f = RECOVERY_FIXTURES.find((x) => x.day === day)!;
      expect(classifyLocation(`${f.location}\n${f.spatialSetup}`)).toBe(expected);
    });
  }

  it("word-boundary matching kills both shipped substring bugs", () => {
    // "small white towel" must not read as a shopping mall
    expect(classifyLocation("boutique pilates studio, small white towel folded on the reformer frame")).toBe("studio_gym");
    // "no parked cars" must not read as a car interior
    expect(classifyLocation("a city sidewalk in El Born, no parked cars in the immediate foreground")).toBe("street");
  });
});

describe("classifyAction", () => {
  it("reads locomotion, stationary and activity classes out of prose", () => {
    expect(classifyAction("she walks down the street")).toBe("locomotion");
    expect(classifyAction("she is reclined into the quilted leather bucket seat")).toBe("reclining");
    expect(classifyAction("a single reformer, pilates studio")).toBe("exercise");
    expect(classifyAction("she sits on the edge of the unmade bed")).toBe("seated_still");
  });
});

describe("ambiencePhraseForLocation", () => {
  it("gives every location a physically possible ambience", () => {
    expect(ambiencePhraseForLocation("studio_gym")).toBe("studio room tone");
    expect(ambiencePhraseForLocation("street")).toBe("outdoor ambience");
    expect(ambiencePhraseForLocation("terrace_rooftop")).toBe("outdoor ambience");
    expect(ambiencePhraseForLocation("car_interior")).toBe("car cabin ambience");
    expect(ambiencePhraseForLocation("bedroom")).toBe("natural room tone");
  });
});

describe("RECOVERY eval — the eight real reels", () => {
  for (const f of RECOVERY_FIXTURES.filter((x) => x.expect === "fail")) {
    it(`day ${f.day} (${f.date}) raises at least one error`, () => {
      const result = runFixture(f);
      expect(
        result.errors.length,
        `day ${f.day} produced no error. Known violations that must be caught:\n  - ${f.knownViolations.join("\n  - ")}`
      ).toBeGreaterThan(0);
    });
  }

  for (const f of RECOVERY_FIXTURES.filter((x) => x.expect === "pass")) {
    it(`day ${f.day} (${f.date}) passes clean`, () => {
      const result = runFixture(f);
      expect(
        result.errors.map((e) => `${e.rule}: ${e.detail}`),
        `day ${f.day} is one of the two best-performing reels in the window and must not trip the validator`
      ).toEqual([]);
      expect(result.warnings.map((w) => w.rule)).toEqual([]);
    });
  }
});

describe("RECOVERY eval — each shipped violation is caught by the rule it belongs to", () => {
  const rulesFor = (day: number) => new Set(runFixture(RECOVERY_FIXTURES.find((f) => f.day === day)!).errors.map((e) => e.rule));
  const warningsFor = (day: number) =>
    new Set(runFixture(RECOVERY_FIXTURES.find((f) => f.day === day)!).warnings.map((w) => w.rule));

  it("day 88 — walking archetype on a woman reclined in a car", () => {
    expect(rulesFor(88)).toContain("locomotion_coherence");
  });

  it("day 88 — speech layer on a scene whose point is not speaking", () => {
    expect(warningsFor(88)).toContain("speech_gating");
  });

  it("day 90 — car cabin ambience on an open sidewalk", () => {
    expect(rulesFor(90)).toContain("audio_environment_coherence");
  });

  it("day 92 — mall reverb in a boutique pilates studio", () => {
    expect(rulesFor(92)).toContain("audio_environment_coherence");
  });

  it("day 92 — drinking-vessel physics with no drinking vessel in the scene", () => {
    expect(rulesFor(92)).toContain("prop_coherence");
  });

  it("day 89 — the espresso cup IS in the brief, so prop_coherence must stay silent there", () => {
    expect(rulesFor(89)).not.toContain("prop_coherence");
    // its real problems are shape, not props
    expect(rulesFor(89)).toContain("auto_reel_single_action");
  });

  it("days 89–93 — the 5–9s range violates the one-duration rule", () => {
    for (const day of [89, 90, 91, 92, 93]) expect(rulesFor(day)).toContain("auto_reel_duration");
  });

  it("days 91 and 93 — indoor room tone outdoors", () => {
    for (const day of [91, 93]) expect(rulesFor(day)).toContain("audio_environment_coherence");
  });
});

describe("speech gating strips the layer rather than blocking the pipeline", () => {
  it("removes the speech block and leaves the rest of the prompt intact", () => {
    const f = RECOVERY_FIXTURES.find((x) => x.day === 91)!;
    const result = runFixture(f);
    expect(result.sanitizedPrompt).toBeDefined();
    expect(result.sanitizedPrompt).not.toMatch(/EXACT SPOKEN LINE/);
    expect(result.sanitizedPrompt).toMatch(/light shifts across her/);
  });

  it("leaves speech alone when the brief declares speaking is the point", () => {
    const f = RECOVERY_FIXTURES.find((x) => x.day === 91)!;
    const result = validateSceneCoherence({
      brief: { spatial_setup: f.spatialSetup, allowed_props: f.allowedProps, speech_is_the_point: true },
      prompt: f.prompt,
      sceneLocation: f.location,
    });
    expect(result.warnings.map((w) => w.rule)).not.toContain("speech_gating");
    expect(result.sanitizedPrompt).toBeUndefined();
  });
});

describe("format coherence", () => {
  const pilates = RECOVERY_FIXTURES.find((f) => f.day === 92)!;
  const street = RECOVERY_FIXTURES.find((f) => f.day === 90)!;

  it("rejects a GRWM format on a scene with no getting-ready action", () => {
    const result = validateSceneCoherence({
      brief: { spatial_setup: street.spatialSetup },
      prompt: "she walks along the pavement. 6s, 9:16.",
      sceneLocation: street.location,
      activityHint: "walking between two places",
      reelFormatId: "grwm",
    });
    expect(result.errors.map((e) => e.rule)).toContain("format_coherence");
  });

  it("accepts an ASMR format on a scene whose action is a repeatable in-place gesture", () => {
    const result = validateSceneCoherence({
      brief: { spatial_setup: pilates.spatialSetup, action_class: "gesture", location_class: "studio_gym" },
      prompt: "she smooths the towel along the reformer frame. 6s, 9:16.",
      reelFormatId: "asmr_satisfying",
    });
    expect(result.errors.map((e) => e.rule)).not.toContain("format_coherence");
  });

  it("imposes nothing for formats that are framing shapes rather than action shapes", () => {
    const result = validateSceneCoherence({
      brief: { spatial_setup: street.spatialSetup },
      prompt: "she walks along the pavement. 6s, 9:16.",
      sceneLocation: street.location,
      reelFormatId: "pov",
    });
    expect(result.errors.map((e) => e.rule)).not.toContain("format_coherence");
  });
});

describe("authored structured fields win over derivation", () => {
  it("uses location_class / action_class straight from the brief when present", () => {
    const s = resolveSceneSemantics(
      { spatial_setup: "a city sidewalk in El Born", location_class: "cafe_restaurant", action_class: "seated_still" },
      {}
    );
    expect(s.locationClass).toBe("cafe_restaurant");
    expect(s.actionClass).toBe("seated_still");
    expect(s.authored).toBe(true);
  });

  it("marks derived semantics as not authored", () => {
    const s = resolveSceneSemantics({ spatial_setup: "a city sidewalk in El Born" }, {});
    expect(s.authored).toBe(false);
  });
});

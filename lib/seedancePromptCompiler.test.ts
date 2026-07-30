import { describe, it, expect } from "vitest";
import {
  compileSeedancePrompt,
  checkShotConflicts,
  MAX_SINGLE_SHOT_PROMPT_LENGTH,
  MAX_MULTI_SHOT_PROMPT_LENGTH,
  type SeedancePromptInput,
} from "./seedancePromptCompiler";
import { buildShotDirections, type ShotDirection } from "./shotDirection";
import { BANNED_COLLAGE_TERMS } from "./imagePromptCompiler";
import type { GenerativeSituation } from "./situationPlanner";

// House convention note: this repo does not use Vitest's `.toMatchSnapshot()` anywhere — the
// "snapshot"-style tests requested here are implemented as structural pinning assertions
// (exact substrings, exact ordering, regex-anchored sections) instead of a `.snap` file.

function baseSituation(overrides: Partial<GenerativeSituation> = {}): GenerativeSituation {
  return {
    content_tier: "luxe_car",
    current_life_context: "a night out",
    life_domain: "nightlife_and_transit_arrival",
    continuity_phase: "event",
    desire_signal: "she decided to go",
    trigger: "an invitation arrived",
    activity: "stepping out of a car",
    reason: "arriving at a destination",
    social_context: { mode: "off_camera_person", implication: "a driver is present, not shown" },
    emotional_state: "electric, deliberate",
    previous_consequence: null,
    next_implication: null,
    personality_signal: "confident",
    reality_detail: "the clutch is unzipped",
    magnetic_hook: "mid-step out of the car",
    magnetism_reason: "provocative_ambiguity",
    sexual_energy: { level: "provocative", expression: "direct eye contact toward camera", boundary: "back bare to the waist, no lower" },
    fanvue_tension: { potential: "strong", continuation: "closer, tighter framing", withheld_element: "the full rear view" },
    visual_execution: { location: "city street at night, beside a luxury car", time_of_day: "night", weather: "warm, clear", action_visible: "stepping out, one heel on the sill", shot_intent: "full-body to three-quarter frame" },
    sensual_visual_language: {
      wardrobe_signal: "backless halter bodysuit with tailored shorts",
      body_emphasis: "back and shoulders, bodycon silhouette",
      gesture_or_action: "stepping out with one heel on the sill",
      camera_relationship: "medium full-body frame from just outside the car",
      exposure_boundary: "bare back to the waist is IG-safe",
    },
    sex_appeal_style: {
      outfit_archetype: "backless structured halter bodysuit",
      silhouette_focus: "back and shoulders",
      leg_visibility: "mid-thigh down",
      facial_energy: "teasing closed-mouth smile",
      seduction_mode: "controlled reveal",
    },
    luxury_seduction: {
      luxury_level: "high_luxury",
      fashion_direction: "backless structured halter bodysuit with tailored shorts",
      material_language: "matte structured crepe",
      accessory_language: "thin gold chain, small structured clutch",
      footwear: "pointed black heeled sandals",
      pose_archetype: "stepping out of a car, one heel on the sill, half-turned",
      body_geometry: "open shoulder and back line",
      facial_seduction: "teasing closed-mouth smile, controlled",
      social_status_signal: "the car door is still open, cabin light warm",
    },
    playful_hot_world: {
      mood_temperature: "warm",
      vitality_level: "electric",
      social_pulse: "private",
      seasonality: "summer",
      color_energy: "vivid",
      fun_factor: "high",
    },
    ...overrides,
  };
}

const REAL_SHOTS = buildShotDirections(baseSituation(), "luxe_car");
const IDENTITY = "Vivienne, mid-20s, dark hair, slim athletic build";
const CONTINUITY = "same woman, same outfit and setting throughout, continuous night";

function singleShotInput(shot: ShotDirection = REAL_SHOTS[2]): SeedancePromptInput {
  return {
    format: "single_shot",
    duration_seconds: 6,
    aspect_ratio: "9:16",
    identity: IDENTITY,
    continuity: CONTINUITY,
    shots: [shot],
    visual_style: "warm cinematic contrast, dark night street",
  };
}

function multiShotInput(shots: ShotDirection[] = REAL_SHOTS): SeedancePromptInput {
  return {
    format: "multi_shot",
    duration_seconds: 18,
    aspect_ratio: "16:9",
    identity: IDENTITY,
    continuity: CONTINUITY,
    shots,
    visual_style: "warm amber cabin and garage light against a dark night",
  };
}

describe("compileSeedancePrompt — single shot", () => {
  it("contains the exact header, the positive single-frame close lock, and no shot numbering", () => {
    const prompt = compileSeedancePrompt(singleShotInput());
    expect(prompt).toMatch(/^Single continuous shot, 6 seconds, vertical 9:16\./);
    expect(prompt).toContain("One adult woman, one body position, one continuous moment.");
    expect(prompt).not.toMatch(/Shot\s+1:/);
  });

  it("contains the audio silence lock by default, or a custom audio line when provided", () => {
    const withDefault = compileSeedancePrompt(singleShotInput());
    expect(withDefault).toContain("NO MUSIC. NO DIALOGUE. NO SOUND EFFECTS.");

    const withCustom = compileSeedancePrompt({ ...singleShotInput(), audio: "faint distant city hum" });
    expect(withCustom).toContain("faint distant city hum");
    expect(withCustom).not.toContain("NO MUSIC");
  });

  it("stays within MAX_SINGLE_SHOT_PROMPT_LENGTH", () => {
    const prompt = compileSeedancePrompt(singleShotInput());
    expect(prompt.length).toBeLessThanOrEqual(MAX_SINGLE_SHOT_PROMPT_LENGTH);
  });

  it("image-to-video: drops static wardrobe/pose/lighting text the source image already shows, leads with movement + camera", () => {
    // Kling's own prompting guide (verified this session): for image-to-video, drop Subject and
    // Scene descriptions and lead with Subject Movement + Camera Language instead. Every real
    // call this compiler feeds is image-to-video (lib/klingProvider.ts), so single_shot must
    // never restate wardrobe/pose/lighting the source frame already carries.
    const shot = REAL_SHOTS[2]; // escalation — has a long, distinctive wardrobe_state in the fixture
    const prompt = compileSeedancePrompt(singleShotInput(shot));
    expect(prompt).not.toContain(shot.wardrobe_state.slice(0, 30));
    expect(prompt).not.toContain(shot.pose.slice(0, 20));
    expect(prompt).not.toContain(shot.lighting);
    // still leads with the actual movement and names the camera framing
    expect(prompt).toContain(shot.framing);
  });
});

describe("compileSeedancePrompt — six-shot Fanvue video", () => {
  const prompt = compileSeedancePrompt(multiShotInput());

  it("has the correct header stating 6 shots and total duration", () => {
    expect(prompt).toMatch(/^6 shots, 18 seconds total, horizontal 16:9\./);
  });

  it("numbers all 6 shots in ascending order, each exactly once", () => {
    const indices = [...prompt.matchAll(/Shot (\d+):/g)].map((m) => Number(m[1]));
    expect(indices).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stays within MAX_MULTI_SHOT_PROMPT_LENGTH", () => {
    expect(prompt.length).toBeLessThanOrEqual(MAX_MULTI_SHOT_PROMPT_LENGTH);
  });

  it("keeps a short wardrobe delta per shot (carries the escalation arc) but drops facial/lighting text", () => {
    // multi_shot still starts from one static source image, but unlike single_shot it needs to
    // carry the bridge->payoff escalation signal somehow — a short wardrobe-state line is the one
    // thing that can't come from a single static frame. facial_expression/lighting/atmosphere are
    // dropped entirely (the source image + Style: block already cover them).
    expect(prompt).not.toContain(REAL_SHOTS[0].facial_expression);
    expect(prompt).not.toContain(REAL_SHOTS[0].lighting);
  });
});

describe("compileSeedancePrompt — continuous POV", () => {
  it("includes the continuous-take lock and never instructs a cut", () => {
    const input: SeedancePromptInput = { ...multiShotInput(REAL_SHOTS.slice(0, 3)), format: "continuous_pov", duration_seconds: 9 };
    const prompt = compileSeedancePrompt(input);
    expect(prompt).toContain("One continuous take, camera never cuts.");
    // "no cuts"/"never cuts" are positive-lock phrasing, not an instruction to cut — ensure no
    // standalone directive like "cut to" appears.
    expect(prompt.toLowerCase()).not.toMatch(/\bcut to\b/);
  });
});

describe("compileSeedancePrompt — correct header/section order", () => {
  it("multi_shot: header, then identity, then Shot 1, then Style, in that order", () => {
    const prompt = compileSeedancePrompt(multiShotInput());
    const headerIdx = prompt.indexOf("6 shots, 18 seconds total");
    const identityIdx = prompt.indexOf(IDENTITY);
    const shot1Idx = prompt.indexOf("Shot 1:");
    const styleIdx = prompt.indexOf("Style:");
    expect(headerIdx).toBe(0);
    expect(identityIdx).toBeGreaterThan(headerIdx);
    expect(shot1Idx).toBeGreaterThan(identityIdx);
    expect(styleIdx).toBeGreaterThan(shot1Idx);
  });

  it("single_shot: header, then identity, then shot content, then close lock, in that order", () => {
    const prompt = compileSeedancePrompt(singleShotInput());
    const headerIdx = prompt.indexOf("Single continuous shot");
    const identityIdx = prompt.indexOf(IDENTITY);
    const lockIdx = prompt.indexOf("One adult woman, one body position, one continuous moment.");
    expect(headerIdx).toBe(0);
    expect(identityIdx).toBeGreaterThan(headerIdx);
    expect(lockIdx).toBeGreaterThan(identityIdx);
  });
});

describe("compileSeedancePrompt — no duplicate lines / business vocabulary / banned collage terms", () => {
  it("dedup runs per-section, never gutting a later shot's content because an earlier shot (or the shared base fields buildShotDirections intentionally reuses across beats) happens to produce an identical line", () => {
    // Real production regression: pose/facial_expression/lighting are shared base strings across
    // all 6 beats in buildShotDirections (only the beat-specific suffix differs) — a global,
    // whole-string dedup silently stripped those lines from shot 2 and shot 3 once shot 1 had
    // already "claimed" the line, leaving later shots with almost no direction.
    const prompt = compileSeedancePrompt(multiShotInput(REAL_SHOTS.slice(0, 3)));
    for (let i = 1; i <= 3; i++) {
      const blockMatch = prompt.match(new RegExp(`Shot ${i}:\\n([\\s\\S]*?)(?=\\n\\nShot ${i + 1}:|\\n\\nStyle:)`));
      expect(blockMatch, `Shot ${i} block should exist`).toBeTruthy();
      const blockLines = blockMatch![1].split("\n").filter((l) => l.trim());
      expect(blockLines.length, `Shot ${i} should retain multiple content lines, not just the action line`).toBeGreaterThanOrEqual(3);
    }
  });

  it("still removes an accidental duplicate line WITHIN a single shot's own block", () => {
    const withInternalDup = { ...REAL_SHOTS[0], facial_expression: REAL_SHOTS[0].pose };
    const prompt = compileSeedancePrompt(multiShotInput([withInternalDup, REAL_SHOTS[1], REAL_SHOTS[2]]));
    const shot1Match = prompt.match(/Shot 1:\n([\s\S]*?)(?=\n\nShot 2:)/);
    const shot1Lines = shot1Match![1].split("\n").filter((l) => l.trim());
    expect(new Set(shot1Lines).size).toBe(shot1Lines.length);
  });

  it("never leaks Fanvue business vocabulary", () => {
    const prompt = compileSeedancePrompt(multiShotInput());
    for (const term of ["paid_promise", "content_level", "erotic_tease", "premium_sensual", "payoff", "premium_sensual"]) {
      if (term === "payoff") continue; // legitimate as a step label upstream, never emitted into prose here anyway
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });

  it("never contains a banned collage/panel term", () => {
    const prompt = compileSeedancePrompt(multiShotInput());
    for (const term of BANNED_COLLAGE_TERMS) {
      expect(prompt.toLowerCase()).not.toContain(term);
    }
  });
});

describe("checkShotConflicts", () => {
  it("passes real, distinct production shots", () => {
    expect(checkShotConflicts(REAL_SHOTS)).toEqual({ passes: true, reasons: [] });
  });

  it("rejects when two shots share byte-identical pose+wardrobe", () => {
    const conflicting = [REAL_SHOTS[0], { ...REAL_SHOTS[1], pose: REAL_SHOTS[0].pose, wardrobe_state: REAL_SHOTS[0].wardrobe_state }, REAL_SHOTS[2]];
    const result = checkShotConflicts(conflicting);
    expect(result.passes).toBe(false);
    expect(result.reasons.join(" ")).toContain("byte-identical pose+wardrobe");
  });
});

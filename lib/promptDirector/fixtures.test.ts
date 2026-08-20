import { describe, expect, it, vi } from "vitest";
import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { PromptDirectorInput } from "./types";

// Acceptance test fixtures (spec §28). Each fixture compiles a realistic PromptDirectorInput and
// asserts the specific properties the spec calls out, and console.logs the compiled prompt so it
// can be pasted into the pre-push report. Fixture 6 (auto-speech) is the only one that touches
// claudeWithRetry — mocked here so the whole suite stays network-free like every other test in
// this module.
vi.mock("@/lib/generatePrompts", () => ({
  claudeWithRetry: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "I love mornings like this, slow and a little quiet." }],
  }),
}));

const { compilePromptDirector } = await import("./compiler");

const CHARACTER: PromptDirectorInput["character"] = {
  id: "char-vivienne",
  name: "Vivienne",
  visualBrief: "late-20s woman, dark wavy hair, athletic build, warm olive skin tone",
  sacredDetails: {
    wardrobe_anchors: ["thin gold chain", "small gold hoops"],
    never_show: ["visible tattoos", "facial piercings"],
    anatomy_anchors: {
      hands: "feminine hands, slim fingers, smooth skin, no body hair",
      jawline: "soft feminine jawline, no facial hair, no beard shadow",
    },
  },
  soulId: "soul-vivienne-01",
};

function sceneBrief(overrides: Partial<SceneBriefJson> = {}): SceneBriefJson {
  return {
    camera_language: "static handheld 50mm",
    color_palette: ["terracotta", "warm cream", "sage green"],
    visual_rules: ["wardrobe never changed", "no mirrors", "one light source"],
    location_constraints: ["tall window 1.5m to her right, sheer linen curtain half-drawn"],
    spatial_setup: "Her kitchen — pale oak counter along the window wall, deep-sage lower cabinets, open shelf with handmade ceramics.",
    environment_anchor: "deep-sage lower cabinets with brass handles",
    wardrobe_lock: "washed-white cotton tee (relaxed, slightly cropped), faded straight-leg jeans, no shoes, thin gold chain",
    allowed_props: ["espresso cup"],
    lighting_state: "window light from the left, soft, warm morning white",
    time_of_day: "morning",
    weather_implied: "clear",
    ...overrides,
  };
}

describe("Fixture 1 — extreme close-up portrait (soul2)", () => {
  it("gets strong face identity, skin realism, natural asymmetry, appropriate camera, no motion/audio", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief(),
      slot: { slot: "carousel_5", channel: "feed", type: "photo", sequence_index: 5, family: "detail", framing: "Emotional close on face — eyes, mouth, micro-expression." },
      archetypeId: "emotional_close",
      archetypeGuidance: "Punchline of the visual sentence.",
      outputType: "image",
      generationMode: "text_to_image",
      targetModel: "soul2",
      hasReferenceImage: true,
    });
    console.log("\n=== FIXTURE 1: extreme close-up portrait (soul2) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    // emotional_close frames the jawline, not the hands — must get the jawline anchor and MUST
    // NOT get the hands anchor just because some other body part is defined in sacred_details.
    expect(pkg.sections.identity?.join(" ")).toContain("soft feminine jawline");
    expect(pkg.sections.identity?.join(" ")).not.toContain("feminine hands, slim fingers");
    expect(pkg.sections.realism?.join(" ")).toContain("visible pores");
    expect(pkg.sections.realism?.join(" ")).toContain("subtle facial asymmetry");
    expect(pkg.sections.camera?.join(" ")).toContain("close");
    expect(pkg.sections.videoSpecs).toBeUndefined();
    expect(pkg.sections.audio).toBeUndefined();
  });
});

describe("Fixture 2 — full-body lifestyle (soul2)", () => {
  it("gets body proportions, wardrobe, scene, natural posture, no facial close-up overload", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief(),
      slot: { slot: "carousel_1", channel: "feed", type: "photo", sequence_index: 1, family: "environment", framing: "Wide establishing frame. Subject embedded in environment, not centered." },
      archetypeId: "wide_interior",
      archetypeGuidance: "Establish the room before she enters it.",
      outputType: "image",
      generationMode: "text_to_image",
      targetModel: "soul2",
      hasReferenceImage: true,
    });
    console.log("\n=== FIXTURE 2: full-body lifestyle (soul2) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    expect(pkg.sections.appearance?.join(" ")).toContain("washed-white cotton tee");
    expect(pkg.sections.scene?.join(" ")).toContain("Her kitchen");
    expect(pkg.sections.realism?.join(" ")).not.toContain("visible pores");
    expect(pkg.sections.imperfections ?? []).toEqual([]); // environment family -> no imperfection block
  });
});

describe("Fixture 3 — walking Reel (kling, image-to-video)", () => {
  it("keeps start-frame continuity, realistic walking, clothing/hair response, camera logic", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief({ spatial_setup: "A quiet tree-lined street outside her building, morning light." }),
      slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "5-9 seconds, 9:16. Motion continues from the reel_start_frame pose." },
      archetypeId: "walking_motion",
      archetypeGuidance: "Continue the walk established in the start frame.",
      outputType: "video",
      generationMode: "image_to_video",
      targetModel: "kling",
      hasReferenceImage: true,
      videoIntent: {
        mode: "motion_only",
        durationSec: 7,
        action: "she walks toward the camera along the sidewalk, glancing up once",
        cameraBehavior: "static camera",
      },
    });
    console.log("\n=== FIXTURE 3: walking Reel (kling, i2v) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    expect(pkg.sections.reference?.join(" ")).toContain("exact starting frame");
    expect(pkg.sections.humanMovement?.join(" ")).toContain("Natural walking rhythm");
    expect(pkg.sections.humanMovement?.join(" ")).toContain("natural clothing response");
    expect(pkg.sections.environmentMovement?.join(" ")).toContain("weight transfers naturally");
    expect((pkg.sections.camera ?? []).filter((l) => /static camera/i.test(l)).length).toBe(1);
  });
});

describe("Fixture 4 — talking bathroom selfie, custom Czech speech (seedance)", () => {
  const CZECH_LINE = "Teď ti ukážu, jak to udělat.";

  it("keeps exact text unchanged, Czech language, facial micro-movement, lipsync stability, bathroom ambience, smartphone realism", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief({ spatial_setup: "Her bathroom — pale tile, single mirror, warm bulb overhead.", lighting_state: "warm bulb overhead, single source", allowed_props: [] }),
      slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "Talking selfie, face to camera, phone held at arm's length." },
      archetypeId: "gesture_motion",
      archetypeGuidance: "Direct-to-camera talking moment.",
      outputType: "talking_video",
      generationMode: "image_to_video",
      targetModel: "seedance",
      hasReferenceImage: true,
      videoIntent: {
        mode: "talking_to_camera",
        durationSec: 6,
        speech: { source: "manual", text: CZECH_LINE, language: "cs", tone: "warm, direct" },
      },
    });
    console.log("\n=== FIXTURE 4: talking bathroom selfie, custom Czech (seedance) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    expect(pkg.positivePrompt).toContain(`"${CZECH_LINE}"`);
    expect(pkg.positivePrompt).toContain("Language: cs");
    expect(pkg.sections.expression?.join(" ")).toContain("subtle cheek movement");
    expect(pkg.sections.lipSync?.join(" ")).toContain("facial integrity > natural articulation > perfect phoneme sync");
    expect(pkg.sections.audio?.join(" ")).toContain("bathroom reverb");
    expect(pkg.sections.audio?.join(" ")).toContain("smartphone microphone");
  });
});

describe("Fixture 5 — motion-only Reel (kling)", () => {
  it("has no speech/audio dialogue, a simple action, and identity stability", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief(),
      slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "5-9 seconds, 9:16." },
      archetypeId: "gesture_motion",
      archetypeGuidance: "One small self-contained gesture.",
      outputType: "video",
      generationMode: "image_to_video",
      targetModel: "kling",
      hasReferenceImage: true,
      videoIntent: { mode: "motion_only", durationSec: 6, action: "she lifts the necklace briefly and lets it fall back", cameraBehavior: "static camera" },
    });
    console.log("\n=== FIXTURE 5: motion-only Reel (kling) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    expect(pkg.sections.speech).toBeUndefined();
    expect(pkg.sections.audio).toBeUndefined();
    expect(pkg.positivePrompt).not.toContain("EXACT SPOKEN LINE");
    expect(pkg.sections.identity?.join(" ")).toContain("Preserve exact facial identity");
  });
});

describe("Fixture 6 — auto-speech Reel (seedance)", () => {
  it("generates a line that fits the scene, stays short, and reaches the compiled prompt", async () => {
    const pkg = await compilePromptDirector({
      character: CHARACTER,
      sceneBrief: sceneBrief({ spatial_setup: "Her kitchen, coffee in hand, morning light through the window." }),
      slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "Talking selfie, face to camera." },
      archetypeId: "gesture_motion",
      archetypeGuidance: "A short unscripted morning thought.",
      outputType: "talking_video",
      generationMode: "image_to_video",
      targetModel: "seedance",
      hasReferenceImage: true,
      videoIntent: {
        mode: "talking_to_camera",
        durationSec: 5,
        speech: { source: "auto", language: "en", tone: "warm" },
      },
    });
    console.log("\n=== FIXTURE 6: auto-speech Reel (seedance) ===\n" + pkg.positivePrompt + "\n\nNEGATIVE: " + pkg.negativePrompt);

    expect(pkg.positivePrompt).toContain("I love mornings like this, slow and a little quiet.");
    expect(pkg.positivePrompt).not.toMatch(/#\w+/); // no hashtag caption-speak leaked through
  });
});

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

describe("Fixture 7 — REAL production data, day 82 reel_start_frame (meta-leakage incident regression)", () => {
  // Pinned verbatim from Vivienne's actual day 82 (2026-08-21) production row — NOT a synthetic
  // fixture. This is the exact slot.framing / SceneBrief content that, before the fix below,
  // compiled into a Soul 2.0 prompt containing "fed to image-to-video (Kling / Seedance)",
  // "CRITICAL: ... identity anchor ... forces the video model to invent a different face", and
  // "Space for the overlay." — Higgsfield then rendered visible TEXT into the generated image.
  const RAW_SLOT_FRAMING =
    "REEL COVER — stop-scroll first frame, built from the image not text. Face forward, eyes to camera, one magnetic expression. Strong single subject, clean and high-contrast. Leave empty space in the top third for a text overlay added later. Vertical 9:16. (Face clearly visible — a headless / face-away frame makes the video model invent a new face.) FORMAT — Relatable confession: One clear expressive beat embodying a small honest feeling (a knowing look, a relieved slump). Space for the overlay. DEPTH & COMPOSITION: build the frame with depth using ONLY what the scene lock already contains — separate foreground / midground / background and shoot across or past the locked surfaces and objects so the space reads three-dimensional, never flat against a blank backdrop. Do NOT invent furniture, props or elements the scene lock excludes; if the location is intentionally sparse, get depth from angle, distance and natural layers instead of adding things.";

  const RAW_SPATIAL_SETUP =
    "Rooftop pool terrace — a single continuous ledge of wide pale sand-tone tiles running along the pool edge, pool water directly in front dropping away into deep aquamarine, the pool roughly 4m wide visible behind her legs; the tile ledge is 1.2m deep from the pool lip to where a low concrete parapet begins at the terrace perimeter; no sun loungers within 3m of her, no tables immediately beside her, only the pool edge tile and the tall glass resting on it to her right; city rooftops and a hazy skyline extend behind the parapet 8–15m back and fill the background in soft focus; the terrace has no umbrellas, no overhead structure, no pergola — open sky above; far end of the terrace has a cluster of blurred pool guests and a bar counter, both entirely out of focus; no signage, no logos, no legible text anywhere in frame. — a row of cream-colored buildings with zinc mansard roofs directly behind her, a dense low-rise skyline beyond, no distant skyscrapers";

  const RAW_WARDROBE_LOCK =
    "white matte-stretch swimsuit (high hip cut, scoop neck, thin fixed shoulder straps, full chest and torso coverage, smooth fabric sitting close to the body, no logo, no embellishment), off-white linen overshirt worn open and loose (collar open, no buttons fastened, sleeves pushed up to the elbows, fabric draping softly at the sides without being tucked or tied, hem falling to upper thigh over the swimsuit, no logo), barefoot, thin single delicate gold chain necklace at collarbone height, small gold stud earrings under 8mm plain, oversized sunglasses pushed up onto her head above the forehead (arms open in hair, not on face, not held in hand), no bag, no watch, no ring, no bracelet, no anklet, damp tousled dark wavy hair falling past the shoulder";

  const day82Character: PromptDirectorInput["character"] = {
    id: "char-vivienne-day82",
    name: "Vivienne",
    visualBrief: "Dark wavy hair, green eyes, late 20s appearance, slim athletic build, sun-kissed skin.",
    sacredDetails: {
      wardrobe_anchors: ["thin gold chain necklace — always worn, regardless of outfit", "small gold stud or hoop earrings — always worn"],
      never_show: ["phone screen contents", "branded fashion items with visible logos"],
      anatomy_anchors: {
        neck: "smooth feminine neck, no Adam's apple, thin gold chain visible",
        shoulders: "narrow feminine shoulders, lightly sun-kissed, soft musculature",
      },
    },
    soulId: "43d6e73e-f0ac-4f22-a82b-f5819f15367f",
  };

  function day82SceneBrief(): SceneBriefJson {
    return {
      camera_language: "handheld 35mm, slight upward angle from pool-deck level",
      color_palette: ["terracotta", "warm cream"],
      visual_rules: ["wardrobe never changed"],
      location_constraints: [
        "pool edge runs horizontally across lower third of frame — pale sand-tone tile, wet and catching late sun",
        "city skyline sits 8–15m behind her at rooftop level, out of focus, golden haze",
      ],
      spatial_setup: RAW_SPATIAL_SETUP,
      environment_anchor: "a row of cream-colored buildings with zinc mansard roofs directly behind her, a dense low-rise skyline beyond, no distant skyscrapers",
      wardrobe_lock: RAW_WARDROBE_LOCK,
      allowed_props: [],
      lighting_state:
        "direct late-afternoon sun from low on the horizon at roughly 20–25 degrees, arriving from camera-left, casting warm gold light across her legs, shoulders and the wet tile — hard enough to create short soft shadows, warm enough to read as golden hour",
      time_of_day: "golden_hour",
      weather_implied: "clear",
    };
  }

  function wordCount(prompt: string): number {
    return prompt.replace(/^Model:.*\n\n/, "").trim().split(/\s+/).filter(Boolean).length;
  }

  it("produces a short, visual-only prompt — no workflow/meta leakage, hard word budget respected", async () => {
    const pkg = await compilePromptDirector({
      character: day82Character,
      sceneBrief: day82SceneBrief(),
      slot: { slot: "reel_start_frame", channel: "reel", type: "photo", sequence_index: null, family: "subject", framing: RAW_SLOT_FRAMING },
      archetypeId: "over_shoulder",
      archetypeGuidance: "Shifts perspective from observer to participant.",
      outputType: "image",
      generationMode: "text_to_image",
      targetModel: "soul2",
      hasReferenceImage: true,
      plannedVideoIntent: { mode: "motion_only", action: "she walks, continuing forward motion" },
    });

    const words = wordCount(pkg.positivePrompt);
    console.log(
      "\n=== FIXTURE 7: day 82 reel_start_frame — RAW slot.framing ===\n" + RAW_SLOT_FRAMING +
      "\n\n=== RAW spatial_setup ===\n" + RAW_SPATIAL_SETUP +
      "\n\n=== RAW wardrobe_lock ===\n" + RAW_WARDROBE_LOCK +
      "\n\n=== NEW Soul2 prompt (" + words + " words) ===\n" + pkg.positivePrompt +
      "\n\nNEGATIVE: " + pkg.negativePrompt
    );

    // Hard word budget — structurally enforced, not a warning.
    expect(words).toBeLessThanOrEqual(180);

    // Meta-leakage — the actual production incident. None of these internal workflow/production/
    // slot-naming terms may survive into the compiled prompt (second cleanup pass added the
    // bottom row — internal vocabulary that isn't "workflow" in the Kling/Seedance sense but is
    // equally not a visual fact).
    const forbidden = [
      "kling", "seedance", "image-to-video", "reel_video", "identity anchor",
      "video model", "fed to", "critical:", "first-frame prep", "plannedvideointent",
      "workflow", "scenebrief", "overlay", "scene lock",
      "reel cover", "stop-scroll", "first frame", "carousel",
    ];
    const lower = pkg.positivePrompt.toLowerCase();
    for (const term of forbidden) {
      expect(lower).not.toContain(term);
    }

    // No truncated sentence fragments — every kept detail is a complete clause/phrase, never a
    // mid-word or mid-phrase cut (the literal symptom of the day-82 bug: "thin single delicate..").
    expect(pkg.positivePrompt).not.toMatch(/\.\./);
    expect(pkg.positivePrompt).not.toMatch(/,\s*\./);

    // The real visual facts must survive the translation, just not verbatim/full-length.
    // plannedVideoIntent here is "she walks..." (motion_only) — the walking first-frame-prep
    // fact, not the talking_to_camera one.
    expect(pkg.positivePrompt).toContain("mid-step or ready-to-move");
    expect(pkg.positivePrompt.toLowerCase()).toContain("rooftop pool terrace");
    expect(pkg.positivePrompt.toLowerCase()).toContain("swimsuit");
    // REEL COVER's visual intent must survive under its translated, non-internal wording.
    expect(pkg.positivePrompt).toContain("clearly dominant subject");

    // Text-rendering protection (the incident's actual visible symptom).
    expect(pkg.negativePrompt).toContain("no text");

    // The debug "Model: ..." header is confirmed stripped before every real provider call (see
    // lib/promptClean.ts stripPromptHeader(), used by lib/higgsfieldSoul.ts and every
    // generate-*/route.ts) — what the provider actually receives starts directly with the visual
    // shot instruction, not the header or any label.
    const { stripPromptHeader } = await import("@/lib/promptClean");
    const providerBound = stripPromptHeader(pkg.positivePrompt);
    expect(providerBound.toLowerCase()).not.toMatch(/^model:/);
    expect(providerBound.startsWith("Vertical 9:16 shot")).toBe(true);
  });
});

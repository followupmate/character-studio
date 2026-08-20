import { describe, expect, it } from "vitest";
import { compilePromptDirector } from "./compiler";
import type { PromptDirectorInput } from "./types";
import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { SlotSpec } from "@/lib/archetypeDeck";
import { plannedActionForReelArchetype } from "@/lib/dailyBatch";

// compilePromptDirector() is the main entry point — these tests cover the deterministic compile
// path only (image outputs, and video outputs with videoIntent.speech.source in {"none","manual"}),
// which never calls claudeWithRetry. "auto" speech is covered separately in
// performanceTransformer.test.ts via the pure buildAutoSpeechPrompt() helper, not here, to keep
// this suite network-free (same convention as lib/sceneBrief.test.ts / lib/slotPrompts.test.ts).

const SCENE_BRIEF: SceneBriefJson = {
  camera_language: "static handheld 50mm",
  color_palette: ["terracotta", "warm cream"],
  visual_rules: ["wardrobe never changed", "no mirrors"],
  location_constraints: ["tall window 1.5m to her right, sheer linen curtain half-drawn"],
  spatial_setup: "Her kitchen — pale oak counter along the window wall, deep-sage lower cabinets.",
  environment_anchor: "deep-sage lower cabinets with brass handles",
  wardrobe_lock: "washed-white cotton tee, faded straight-leg jeans, no shoes",
  allowed_props: ["espresso cup"],
  lighting_state: "window light from the left, soft, warm morning white",
  time_of_day: "morning",
  weather_implied: "clear",
};

const CHARACTER: PromptDirectorInput["character"] = {
  id: "char-1",
  name: "Vivienne",
  visualBrief: "late-20s woman, dark hair, athletic build",
  sacredDetails: {
    wardrobe_anchors: ["thin gold chain"],
    never_show: ["visible tattoos"],
    anatomy_anchors: {
      hands: "feminine hands, slim fingers, smooth skin",
      jawline: "soft feminine jawline, no facial hair, no beard shadow",
    },
  },
  soulId: "soul-abc",
};

function slot(overrides: Partial<SlotSpec> = {}): SlotSpec {
  return {
    slot: "carousel_2",
    channel: "feed",
    type: "photo",
    sequence_index: 2,
    family: "subject",
    framing: "Mid shot. Subject in the space established by carousel_1.",
    ...overrides,
  };
}

function baseInput(overrides: Partial<PromptDirectorInput> = {}): PromptDirectorInput {
  return {
    character: CHARACTER,
    sceneBrief: SCENE_BRIEF,
    slot: slot(),
    archetypeId: "wide_interior",
    archetypeGuidance: "Establish the room.",
    outputType: "image",
    generationMode: "text_to_image",
    targetModel: "soul2",
    ...overrides,
  };
}

describe("compilePromptDirector — image / soul2", () => {
  it("produces a well-formed PromptPackage", async () => {
    const pkg = await compilePromptDirector(baseInput());
    expect(pkg.model).toBe("soul2");
    expect(pkg.metadata.promptDirectorVersion).toBe("v1");
    expect(pkg.metadata.outputType).toBe("image");
    expect(pkg.positivePrompt).toContain("Model: Soul 2");
    expect(pkg.negativePrompt).toBeDefined();
  });

  it("never invents scene facts — only sceneBrief content reaches the compiled prompt", async () => {
    const pkg = await compilePromptDirector(baseInput());
    expect(pkg.positivePrompt).toContain(SCENE_BRIEF.spatial_setup);
    expect(pkg.positivePrompt).toContain(SCENE_BRIEF.wardrobe_lock);
    expect(pkg.positivePrompt).not.toContain("invented");
  });

  it("Soul ID present: suppresses the long visual brief, wardrobe-anchor policy, never-show policy and UUID", async () => {
    // Higgsfield Soul 2.0 guidance — once a Soul ID is on file, the platform (not the prompt)
    // enforces identity, so none of this identity-policy text should burn word budget.
    const pkg = await compilePromptDirector(baseInput());
    const identityText = pkg.sections.identity?.join(" ") ?? "";
    expect(identityText).not.toContain("thin gold chain");
    expect(identityText).not.toContain("visible tattoos");
    expect(identityText).not.toContain(CHARACTER.visualBrief);
    expect(identityText).not.toContain(CHARACTER.soulId);
    expect(identityText).toContain("Same character identity as the Soul ID reference");
    expect(pkg.positivePrompt).not.toContain("thin gold chain");
    expect(pkg.positivePrompt).not.toContain("visible tattoos");
    expect(pkg.positivePrompt).not.toContain(CHARACTER.soulId);
  });

  it("no Soul ID: falls back to the full visual brief, wardrobe-anchor and never-show policy", async () => {
    const pkg = await compilePromptDirector(baseInput({ character: { ...CHARACTER, soulId: null } }));
    const identityText = pkg.sections.identity?.join(" ") ?? "";
    expect(identityText).toContain("thin gold chain");
    expect(identityText).toContain("visible tattoos");
    expect(identityText).toContain(CHARACTER.visualBrief);
  });

  it("keeps the Soul 2.0 section order front-loaded: shot, then pose, then scene/lighting/aesthetic/realism", async () => {
    const pkg = await compilePromptDirector(baseInput());
    const order = ["camera", "pose", "scene", "lighting", "aesthetic", "realism"] as const;
    const positions = order.map((key) => pkg.positivePrompt.indexOf(pkg.sections[key]!.join(" ").slice(0, 15)));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("stays within the Soul 2.0 focused-prompt word budget (target 80-150, ceiling ~180)", async () => {
    const pkg = await compilePromptDirector(baseInput());
    const body = pkg.positivePrompt.replace(/^Model:.*\n\n/, "");
    const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(180);
  });

  it("keeps the negative block short for Soul 2.0", async () => {
    const pkg = await compilePromptDirector(baseInput());
    const negativeCount = (pkg.negativePrompt ?? "").split(",").filter((s) => s.trim()).length;
    expect(negativeCount).toBeLessThanOrEqual(8);
  });

  it("does not emit the strict reference block when no reference image is supplied", async () => {
    const pkg = await compilePromptDirector(baseInput({ hasReferenceImage: false }));
    expect(pkg.sections.reference).toEqual([]);
  });

  it("emits the strict reference block when a reference image is supplied", async () => {
    const pkg = await compilePromptDirector(baseInput({ hasReferenceImage: true }));
    expect(pkg.sections.reference?.join(" ")).toContain("strict identity reference");
  });

  it("gives close-up archetypes the stronger realism block, wide shots the lighter one", async () => {
    const wide = await compilePromptDirector(baseInput({ archetypeId: "wide_interior" }));
    const close = await compilePromptDirector(
      baseInput({ archetypeId: "emotional_close", slot: slot({ slot: "carousel_5", family: "detail", framing: "Emotional close on face." }) })
    );
    expect(close.sections.realism?.join(" ")).toContain("visible pores");
    expect(wide.sections.realism?.join(" ")).not.toContain("visible pores");
  });

  it("applies the anatomy anchor only on close-up archetypes", async () => {
    const close = await compilePromptDirector(
      baseInput({ archetypeId: "hands_object", slot: slot({ slot: "carousel_3", family: "detail", framing: "Close detail — hands." }) })
    );
    const wide = await compilePromptDirector(baseInput({ archetypeId: "wide_interior" }));
    expect(close.sections.identity?.join(" ")).toContain("feminine hands, slim fingers");
    expect(wide.sections.identity?.join(" ")).not.toContain("feminine hands");
  });

  it("only surfaces the anatomy anchor for the body part the archetype actually frames", async () => {
    // Regression: a hands_object shot (hands visible, face may be cropped out) must never pull in
    // the jawline anchor, and an emotional_close shot (face/jawline visible, hands not in frame)
    // must never pull in the hands anchor — even though BOTH keys exist in sacred_details.
    const handsShot = await compilePromptDirector(
      baseInput({ archetypeId: "hands_object", slot: slot({ slot: "carousel_3", family: "detail", framing: "Close detail — hands." }) })
    );
    const faceShot = await compilePromptDirector(
      baseInput({ archetypeId: "emotional_close", slot: slot({ slot: "carousel_5", family: "detail", framing: "Emotional close on face." }) })
    );

    expect(handsShot.sections.identity?.join(" ")).toContain("feminine hands, slim fingers");
    expect(handsShot.sections.identity?.join(" ")).not.toContain("jawline");

    expect(faceShot.sections.identity?.join(" ")).toContain("soft feminine jawline");
    expect(faceShot.sections.identity?.join(" ")).not.toContain("feminine hands");
  });

  it("never generates video-only sections for an image output", async () => {
    const pkg = await compilePromptDirector(baseInput());
    expect(pkg.sections.timeline).toBeUndefined();
    expect(pkg.sections.speech).toBeUndefined();
    expect(pkg.sections.lipSync).toBeUndefined();
  });

  it("throws when identity is undefined (validator hard error)", async () => {
    await expect(
      compilePromptDirector(baseInput({ character: { ...CHARACTER, visualBrief: "" } }))
    ).rejects.toThrow(/identity not defined/);
  });

  it("throws when the scene is not anchored (validator hard error)", async () => {
    await expect(
      compilePromptDirector(baseInput({ sceneBrief: { ...SCENE_BRIEF, spatial_setup: "" } }))
    ).rejects.toThrow(/scene not anchored/);
  });

  describe("plannedVideoIntent (§21 — first-frame prep for a future i2v generation)", () => {
    const startFrameSlot = slot({ slot: "reel_start_frame", family: "subject", framing: "First frame of the 9:16 vertical reel." });

    it("does nothing when no plannedVideoIntent is given (identical to today's behavior)", async () => {
      const pkg = await compilePromptDirector(baseInput({ slot: startFrameSlot }));
      expect(pkg.sections.camera?.join(" ")).not.toContain("First-frame prep");
    });

    it("prepares a talking start frame: face visible, mouth unobstructed, hands clear", async () => {
      const pkg = await compilePromptDirector(
        baseInput({ slot: startFrameSlot, plannedVideoIntent: { mode: "talking_to_camera" } })
      );
      const camera = pkg.sections.camera?.join(" ") ?? "";
      expect(camera).toContain("First-frame prep");
      expect(camera).toContain("mouth fully unobstructed");
      expect(camera).toContain("Hands must not block or rest near the face");
    });

    it("prepares a walking start frame: mid-step, room to move", async () => {
      const pkg = await compilePromptDirector(
        baseInput({ slot: startFrameSlot, plannedVideoIntent: { mode: "motion_only", action: "she walks toward the window" } })
      );
      const camera = pkg.sections.camera?.join(" ") ?? "";
      expect(camera).toContain("mid-step or standing");
      expect(camera).toContain("direction of intended movement");
    });

    it("falls back to generic anatomically-sustainable guidance for a plain gesture", async () => {
      const pkg = await compilePromptDirector(
        baseInput({ slot: startFrameSlot, plannedVideoIntent: { mode: "motion_only", action: "she lifts the necklace briefly" } })
      );
      expect(pkg.sections.camera?.join(" ")).toContain("anatomically sustainable");
    });

    it("only applies to the image being compiled — never leaks into a plain photo slot without plannedVideoIntent", async () => {
      const pkg = await compilePromptDirector(baseInput({ archetypeId: "wide_interior" }));
      expect(pkg.sections.camera?.join(" ")).not.toContain("First-frame prep");
    });

    it("end-to-end: today's batch-derived action for a walking_motion reel_video actually produces the walking first-frame guidance", async () => {
      // Integration check for lib/dailyBatch.ts's deterministic archetype -> action mapping: no
      // hand-written action string here, it comes straight from plannedActionForReelArchetype()
      // the same way generateSlotPromptViaDirector() calls it.
      const pkg = await compilePromptDirector(
        baseInput({ slot: startFrameSlot, plannedVideoIntent: { mode: "motion_only", action: plannedActionForReelArchetype("walking_motion") } })
      );
      const camera = pkg.sections.camera?.join(" ") ?? "";
      expect(camera).toContain("mid-step or standing");
      expect(camera).toContain("direction of intended movement");
    });

    it("end-to-end: gesture_motion and light_motion fall back to the generic anatomically-sustainable line", async () => {
      for (const archetype of ["gesture_motion", "light_motion"]) {
        const pkg = await compilePromptDirector(
          baseInput({ slot: startFrameSlot, plannedVideoIntent: { mode: "motion_only", action: plannedActionForReelArchetype(archetype) } })
        );
        expect(pkg.sections.camera?.join(" ")).toContain("anatomically sustainable");
      }
    });
  });
});

describe("compilePromptDirector — video / kling (image-to-video)", () => {
  function videoInput(overrides: Partial<PromptDirectorInput> = {}): PromptDirectorInput {
    return baseInput({
      outputType: "video",
      generationMode: "image_to_video",
      targetModel: "kling",
      hasReferenceImage: true,
      slot: slot({ slot: "reel_video", type: "video", family: "motion", sequence_index: null, framing: "5-9 seconds, 9:16." }),
      videoIntent: {
        mode: "motion_only",
        durationSec: 6,
        action: "she shifts her weight onto one leg and turns her head slightly toward the lens",
        cameraBehavior: "static camera",
      },
      ...overrides,
    });
  }

  it("uses the start-frame reference block instead of re-describing the scene", async () => {
    const pkg = await compilePromptDirector(videoInput());
    expect(pkg.sections.reference?.join(" ")).toContain("exact starting frame");
    // Kling profile deliberately omits scene/lighting — the source image already carries them.
    expect(pkg.sections.scene).toBeUndefined();
    expect(pkg.sections.lighting).toBeUndefined();
  });

  it("never emits audio/speech sections for Kling (no native audio capability)", async () => {
    const pkg = await compilePromptDirector(
      videoInput({ videoIntent: { mode: "voice_over", durationSec: 6, speech: { source: "manual", text: "hello there" } } })
    );
    expect(pkg.positivePrompt).not.toContain("EXACT SPOKEN LINE");
    expect(pkg.sections.audio).toBeUndefined();
  });

  it("resolves a static+moving camera conflict down to one instruction", async () => {
    const pkg = await compilePromptDirector(
      videoInput({ videoIntent: { mode: "motion_only", durationSec: 6, cameraBehavior: "static camera" } })
    );
    const cameraText = pkg.sections.camera?.join(" ") ?? "";
    const staticCount = (cameraText.match(/static camera/gi) ?? []).length;
    expect(staticCount).toBe(1);
  });

  it("includes walking physics only when the action is a walking action", async () => {
    const walking = await compilePromptDirector(videoInput({ videoIntent: { mode: "motion_only", durationSec: 6, action: "she walks toward the window" } }));
    const still = await compilePromptDirector(videoInput());
    expect(walking.sections.environmentMovement?.join(" ")).toMatch(/weight transfers naturally/);
    expect(still.sections.environmentMovement ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("weight transfers naturally")])
    );
  });

  it("grounds a bare abstract mood word into observable behavior", async () => {
    const pkg = await compilePromptDirector(videoInput({ videoIntent: { mode: "motion_only", durationSec: 6, action: "confident" } }));
    expect(pkg.sections.humanMovement?.join(" ")).toContain("steady eye contact");
  });

  it("carries manual speech verbatim on a capable model (seedance)", async () => {
    const pkg = await compilePromptDirector(
      videoInput({
        targetModel: "seedance",
        videoIntent: {
          mode: "voice_over",
          durationSec: 6,
          speech: { source: "manual", text: "Teď ti ukážu, jak to udělat.", language: "cs" },
        },
      })
    );
    expect(pkg.positivePrompt).toContain('EXACT SPOKEN LINE — DO NOT CHANGE WORDING:\n"Teď ti ukážu, jak to udělat."');
    expect(pkg.positivePrompt).toContain("Language: cs");
  });
});

describe("compilePromptDirector — talking_video", () => {
  it("adds facial-integrity-first lipsync priority and talking face behavior", async () => {
    const pkg = await compilePromptDirector(
      baseInput({
        outputType: "talking_video",
        generationMode: "image_to_video",
        targetModel: "seedance",
        hasReferenceImage: true,
        slot: slot({ slot: "reel_video", type: "video", family: "motion", framing: "Talking selfie, face to camera." }),
        videoIntent: {
          mode: "talking_to_camera",
          durationSec: 6,
          speech: { source: "manual", text: "Teď ti ukážu, jak to udělat.", language: "cs" },
        },
      })
    );
    expect(pkg.sections.lipSync?.join(" ")).toContain("facial integrity > natural articulation > perfect phoneme sync");
    expect(pkg.sections.expression?.length).toBeGreaterThan(0);
    expect(pkg.metadata.validation?.errors ?? []).toEqual([]);
    // No videoIntent.action was given, but speech + the deterministic talking-performance layer
    // (expression/lipSync above) ARE the concrete action for talking_to_camera — must not warn.
    expect(pkg.metadata.validation?.warnings ?? []).not.toEqual(
      expect.arrayContaining([expect.stringContaining("no concrete action or timeline")])
    );
  });

  it("hard-blocks talking_video on a face-hiding framing", async () => {
    await expect(
      compilePromptDirector(
        baseInput({
          outputType: "talking_video",
          generationMode: "image_to_video",
          targetModel: "seedance",
          hasReferenceImage: true,
          slot: slot({ slot: "reel_video", type: "video", family: "motion", framing: "Over-shoulder shot, face away from camera." }),
          videoIntent: { mode: "talking_to_camera", durationSec: 6, speech: { source: "manual", text: "hi" } },
        })
      )
    ).rejects.toThrow(/framing hides the face/);
  });
});

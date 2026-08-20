import { describe, expect, it } from "vitest";
import { resolveCameraConflicts, validatePromptDirectorInput } from "./validator";
import type { PromptDirectorInput } from "./types";
import type { SceneBriefJson } from "@/lib/sceneBrief";

const SCENE_BRIEF: SceneBriefJson = {
  camera_language: "static",
  color_palette: [],
  visual_rules: [],
  location_constraints: [],
  spatial_setup: "Her kitchen.",
  wardrobe_lock: "tee",
  allowed_props: [],
  lighting_state: "window light",
  time_of_day: "morning",
  weather_implied: "clear",
};

function baseInput(overrides: Partial<PromptDirectorInput> = {}): PromptDirectorInput {
  return {
    character: { id: "c1", name: "Vivienne", visualBrief: "late-20s woman", sacredDetails: null },
    sceneBrief: SCENE_BRIEF,
    slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "5-9s, 9:16." },
    archetypeId: "gesture_motion",
    archetypeGuidance: "",
    outputType: "video",
    generationMode: "image_to_video",
    targetModel: "kling",
    ...overrides,
  };
}

describe("validatePromptDirectorInput", () => {
  it("errors when identity is missing", () => {
    const { errors } = validatePromptDirectorInput(baseInput({ character: { id: "c1", name: "x", visualBrief: "", sacredDetails: null } }));
    expect(errors.some((e) => e.includes("identity"))).toBe(true);
  });

  it("errors when scene is not anchored", () => {
    const { errors } = validatePromptDirectorInput(baseInput({ sceneBrief: { ...SCENE_BRIEF, spatial_setup: "" } }));
    expect(errors.some((e) => e.includes("scene"))).toBe(true);
  });

  it("warns (does not error) when action implies a moving camera but cameraBehavior is static", () => {
    const { errors, warnings } = validatePromptDirectorInput(
      baseInput({ videoIntent: { mode: "motion_only", action: "camera follows her down the hallway", cameraBehavior: "static camera" } })
    );
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("static camera"))).toBe(true);
  });

  describe("no-concrete-action warning (primarily a motion_only concern)", () => {
    it("warns for motion_only with no action and no timeline", () => {
      const { warnings } = validatePromptDirectorInput(baseInput({ videoIntent: { mode: "motion_only" } }));
      expect(warnings.some((w) => w.includes("no concrete action or timeline"))).toBe(true);
    });

    it("does NOT warn for talking_to_camera with an active speech source, even with no action/timeline — the talking performance itself is the action", () => {
      const { warnings } = validatePromptDirectorInput(
        baseInput({ videoIntent: { mode: "talking_to_camera", speech: { source: "manual", text: "hello there" } } })
      );
      expect(warnings.some((w) => w.includes("no concrete action or timeline"))).toBe(false);
    });

    it("still warns for talking_to_camera with speech source none — nothing concrete at all", () => {
      const { warnings } = validatePromptDirectorInput(
        baseInput({ videoIntent: { mode: "talking_to_camera", speech: { source: "none" } } })
      );
      expect(warnings.some((w) => w.includes("no concrete action or timeline"))).toBe(true);
    });

    it("still exempts voice_over (narration is the content)", () => {
      const { warnings } = validatePromptDirectorInput(baseInput({ videoIntent: { mode: "voice_over" } }));
      expect(warnings.some((w) => w.includes("no concrete action or timeline"))).toBe(false);
    });

    it("never warns once an action is present, regardless of mode", () => {
      const { warnings } = validatePromptDirectorInput(baseInput({ videoIntent: { mode: "motion_only", action: "she turns toward the window" } }));
      expect(warnings.some((w) => w.includes("no concrete action or timeline"))).toBe(false);
    });
  });

  it("flags a manual speech line that can't fit the requested duration", () => {
    const { warnings } = validatePromptDirectorInput(
      baseInput({
        videoIntent: {
          mode: "voice_over",
          durationSec: 2,
          speech: {
            source: "manual",
            text: "This is a very long sentence that could not possibly be spoken naturally in just two seconds of video.",
          },
        },
      })
    );
    expect(warnings.some((w) => w.includes("may not fit"))).toBe(true);
  });

  it("errors on a malformed timeline beat (end before start)", () => {
    const { errors } = validatePromptDirectorInput(
      baseInput({ videoIntent: { mode: "motion_only", timeline: [{ startSec: 3, endSec: 1, action: "turn" }] } })
    );
    expect(errors.some((e) => e.includes("endSec <= startSec"))).toBe(true);
  });

  it("hard-blocks talking_video when the framing hides the face", () => {
    const { errors } = validatePromptDirectorInput(
      baseInput({
        outputType: "talking_video",
        slot: { slot: "reel_video", channel: "reel", type: "video", sequence_index: null, family: "motion", framing: "Over-shoulder, face away." },
        videoIntent: { mode: "talking_to_camera", speech: { source: "manual", text: "hi" } },
      })
    );
    expect(errors.some((e) => e.includes("hides the face"))).toBe(true);
  });
});

describe("resolveCameraConflicts", () => {
  it("keeps only the first camera-behavior phrase within a conflict group", () => {
    const { resolved, removed } = resolveCameraConflicts(["static camera", "natural handheld smartphone", "framing: medium"]);
    expect(resolved).toEqual(["static camera", "framing: medium"]);
    expect(removed).toEqual(["natural handheld smartphone"]);
  });

  it("leaves non-conflicting lines untouched", () => {
    const { resolved, removed } = resolveCameraConflicts(["static camera", "framing: medium shot"]);
    expect(resolved).toEqual(["static camera", "framing: medium shot"]);
    expect(removed).toEqual([]);
  });
});

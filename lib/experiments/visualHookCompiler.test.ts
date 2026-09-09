import { describe, it, expect } from "vitest";
import {
  compileVisualHookReel,
  compileVisualHookStartFrame,
  findMetaLanguage,
  HOOK_BEATS,
  toReelFraming,
} from "@/lib/experiments/visualHookCompiler";
import { compileVisualHookDays, VISUAL_HOOK_DAYS } from "@/lib/experiments/visualHookDays";
import { compileRecoveryDays } from "@/lib/recovery/recoveryDays";
import { compileSimpleReel, DEFAULT_HOOK_BEAT } from "@/lib/recovery/simpleReelCompiler";
import { HOOK_TYPES, VHD_PAYOFF_CEILING_SEC } from "@/lib/experiments/visualHookPlan";

const days = compileVisualHookDays();

describe("the recovery motion compiler is not disturbed", () => {
  it("produces the same prompt it did before the hook seam existed", () => {
    // The seam is an optional parameter with the old sentence as its default. If this ever drifts,
    // the recovery reels and the control arm stop being comparable to what was already measured.
    const base = { sceneBrief: VISUAL_HOOK_DAYS[0].brief, dayNumber: 1, durationSec: 8 };
    expect(compileSimpleReel(base).prompt).toBe(compileSimpleReel({ ...base, hookBeat: DEFAULT_HOOK_BEAT }).prompt);
    expect(compileSimpleReel(base).prompt).toContain(DEFAULT_HOOK_BEAT);
  });

  it("still compiles all five recovery days cleanly", () => {
    expect(() => compileRecoveryDays()).not.toThrow();
    expect(compileRecoveryDays()).toHaveLength(5);
  });
});

describe("hook structure", () => {
  it("gives every hook type a frame-0 tension, a first change and a payoff", () => {
    for (const t of HOOK_TYPES) {
      const b = HOOK_BEATS[t];
      expect(b.openingState.length, t).toBeGreaterThan(10);
      expect(b.hookBeat.length, t).toBeGreaterThan(10);
      expect(b.payoffAction.length, t).toBeGreaterThan(10);
    }
  });

  it("starts every first change immediately, never eventually", () => {
    for (const t of HOOK_TYPES) {
      expect(HOOK_BEATS[t].hookBeat, t).toMatch(/almost immediately/i);
    }
  });

  it("writes no numeric timestamp into any beat", () => {
    // A sub-second figure in the prompt is read by the auto-reel shape validator as the clip
    // length, and no i2v model here honours one anyway. The structure is ordinal on purpose.
    for (const t of HOOK_TYPES) {
      const b = HOOK_BEATS[t];
      expect(`${b.openingState} ${b.hookBeat} ${b.payoffAction}`, t).not.toMatch(/\d+(\.\d+)?\s*(s\b|sec|second)/i);
    }
  });

  it("keeps every arm's payoff inside the ceiling", () => {
    for (const d of days) expect(d.plan.payoffSec, `#${d.slot}`).toBeLessThanOrEqual(VHD_PAYOFF_CEILING_SEC);
  });

  it("names exactly one main action per arm", () => {
    for (const d of days) {
      // The compiled prompt has one Action sentence; the validator's single-action rule already
      // runs, and this guards the input side of it.
      expect(d.compiled.action.split(/\band\b/).length, `#${d.slot}`).toBeLessThanOrEqual(3);
    }
  });
});

describe("all five arms compile clean", () => {
  it("passes the scene-coherence validator with no errors", () => {
    for (const d of days) {
      expect(d.compiled.validation.errors, `#${d.slot}: ${JSON.stringify(d.compiled.validation.errors)}`).toEqual([]);
    }
  });

  it("declares the pinned duration and 9:16 in every motion prompt", () => {
    for (const d of days) {
      expect(d.compiled.durationSec, `#${d.slot}`).toBe(8);
      expect(d.compiled.prompt, `#${d.slot}`).toContain("8s, vertical 9:16.");
    }
  });

  it("holds duration constant so length cannot be confounded with the motif", () => {
    expect(new Set(days.map((d) => d.durationSec)).size).toBe(1);
  });

  it("carries the hook's own beat, not the default one, wherever the hook differs", () => {
    for (const d of days) {
      expect(d.compiled.prompt, `#${d.slot}`).toContain(HOOK_BEATS[d.plan.hookType].hookBeat);
      if (d.plan.hookType !== "gaze_turn") {
        expect(d.compiled.prompt, `#${d.slot}`).not.toContain(DEFAULT_HOOK_BEAT);
      }
    }
  });
});

describe("the start frame", () => {
  it("states the crop first and restates it last", () => {
    for (const d of days) {
      expect(d.startFrame.prompt.startsWith("Vertical 9:16"), `#${d.slot}`).toBe(true);
      expect(d.startFrame.prompt.trimEnd(), `#${d.slot}`).toMatch(/(no feet|no knees|no legs)\.$/i);
    }
  });

  it("never asks for an establishing shot and always refuses typography", () => {
    for (const d of days) {
      expect(d.startFrame.prompt, `#${d.slot}`).not.toMatch(/\b(wide shot|establishing|full body|full length)\b/i);
      expect(d.startFrame.prompt, `#${d.slot}`).toMatch(/no lettering/i);
      expect(d.startFrame.negativePrompt, `#${d.slot}`).toContain("text");
      expect(d.startFrame.negativePrompt, `#${d.slot}`).toContain("typography");
    }
  });

  it("leaks no internal workflow language to the provider", () => {
    for (const d of days) expect(findMetaLanguage(d.startFrame.prompt), `#${d.slot}`).toBeNull();
    expect(findMetaLanguage("compile the reel_video slot")).toBe("reel_video");
  });

  it("composes frame 0 as the hook's own opening state, not a settled pose", () => {
    for (const d of days) {
      expect(d.startFrame.prompt, `#${d.slot}`).toContain(HOOK_BEATS[d.plan.hookType].openingState);
    }
  });

  it("names the scene's own background and never a substituted one", () => {
    for (const d of days) {
      expect(d.startFrame.prompt, `#${d.slot}`).toContain(d.brief.wardrobe_lock);
      expect(d.startFrame.prompt, `#${d.slot}`).toContain(d.brief.spatial_setup);
    }
  });

  it("carries the framing negatives Soul V2 has no crop parameter for", () => {
    for (const d of days) {
      expect(d.startFrame.negativePrompt, `#${d.slot}`).toContain("small face");
      expect(d.startFrame.negativePrompt, `#${d.slot}`).toContain("full body");
    }
  });
});

describe("the invariant is enforced at compile time, not documented", () => {
  it("refuses a motif the scene does not contain", () => {
    expect(() =>
      compileVisualHookReel({
        plan: { ...VISUAL_HOOK_DAYS[0].plan, motifFamily: "bold_color" },
        brief: VISUAL_HOOK_DAYS[0].brief, // the control's warm bedroom — no saturated colour
        durationSec: 8,
      })
    ).toThrow(/saturated/);
  });

  it("refuses an invalid plan before it can reach a provider", () => {
    expect(() =>
      compileVisualHookStartFrame({ ...VISUAL_HOOK_DAYS[0].plan, payoffSec: 4 }, VISUAL_HOOK_DAYS[0].brief)
    ).toThrow(/ceiling/);
  });

  it("leaves the brief object untouched after compiling", () => {
    const before = JSON.stringify(VISUAL_HOOK_DAYS[2].brief);
    compileVisualHookReel({ plan: VISUAL_HOOK_DAYS[2].plan, brief: VISUAL_HOOK_DAYS[2].brief, durationSec: 8 });
    expect(JSON.stringify(VISUAL_HOOK_DAYS[2].brief)).toBe(before);
  });
});

describe("framing translation", () => {
  it("maps the one extra framing onto the motion compiler's vocabulary without widening it", () => {
    expect(toReelFraming("close")).toBe("close");
    expect(toReelFraming("close_medium")).toBe("close_medium");
    // The actual crop is fixed by the start frame the video is generated FROM; the motion prompt
    // only needs to hold the camera still.
    expect(toReelFraming("medium_graphic")).toBe("close_medium");
  });
});

import { describe, it, expect } from "vitest";
import {
  compileVisualHookReel,
  compileVisualHookStartFrame,
  findMetaLanguage,
  HOOK_BEATS,
  splitWardrobeClauses,
  toReelFraming,
  VHD_CLOSING_BEAT,
  visibleWardrobeFor,
} from "@/lib/experiments/visualHookCompiler";
import { compileVisualHookDays, VISUAL_HOOK_DAYS } from "@/lib/experiments/visualHookDays";
import { compileRecoveryDays } from "@/lib/recovery/recoveryDays";
import { compileSimpleReel, DEFAULT_CLOSING_BEATS, DEFAULT_HOOK_BEAT } from "@/lib/recovery/simpleReelCompiler";
import { HOOK_TYPES, VHD_PAYOFF_CEILING_SEC, MOTIF_FAMILIES } from "@/lib/experiments/visualHookPlan";

const days = compileVisualHookDays();

describe("the recovery motion compiler is not disturbed", () => {
  it("produces the same prompt it did before the hook seam existed", () => {
    // The seam is an optional parameter with the old sentence as its default. If this ever drifts,
    // the recovery reels and the control arm stop being comparable to what was already measured.
    const base = { sceneBrief: VISUAL_HOOK_DAYS[0].brief, dayNumber: 1, durationSec: 8 };
    expect(compileSimpleReel(base).prompt).toBe(compileSimpleReel({ ...base, hookBeat: DEFAULT_HOOK_BEAT }).prompt);
    expect(compileSimpleReel(base).prompt).toContain(DEFAULT_HOOK_BEAT);
    for (const line of DEFAULT_CLOSING_BEATS) expect(compileSimpleReel(base).prompt).toContain(line);
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

  it("never defers the first change", () => {
    // This was a check for the literal words "almost immediately". The environment-reaction beat is
    // now the operator's own wording and does not carry them — its immediacy rests on being the
    // first sentence after the opening state, which the template guarantees. So the test checks the
    // failure mode instead of a magic string: no beat may push the change into the future.
    const DEFERRED = /\b(eventually|after a (?:while|moment|few)|later|slowly begins|in time|gradually)\b/i;
    for (const t of HOOK_TYPES) expect(HOOK_BEATS[t].hookBeat, t).not.toMatch(DEFERRED);
  });

  it("puts the hook beat immediately after the opening state in the compiled prompt", () => {
    for (const d of days) {
      // v1.1: four arms carry their own frame-0 pose, so read the effective one.
      const openingAt = d.compiled.prompt.indexOf(d.openingStateOverride ?? HOOK_BEATS[d.plan.hookType].openingState);
      const beatAt = d.compiled.prompt.indexOf(HOOK_BEATS[d.plan.hookType].hookBeat);
      expect(openingAt, `#${d.slot}`).toBeGreaterThan(-1);
      expect(beatAt, `#${d.slot}`).toBeGreaterThan(openingAt);
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

  it("asks for no loop and no forced return", () => {
    // Loop closure is a diagnostic, not a goal. An end-frame lock was tried and reverted on
    // 2026-09-04: the loop delta went 4.0 -> 0.4 while manual QA saw a frozen head on a moving
    // body. Nothing here should spend a sentence on it, and nothing should force a reset.
    for (const d of days) {
      expect(d.compiled.prompt, `#${d.slot}`).not.toMatch(/loop/i);
      expect(d.compiled.prompt, `#${d.slot}`).not.toMatch(/\b(returns? to the (?:same|starting) (?:pose|position)|matches the first)\b/i);
      expect(d.compiled.prompt, `#${d.slot}`).toContain(VHD_CLOSING_BEAT);
    }
  });

  it("ends on the settle, right before the duration line", () => {
    for (const d of days) {
      expect(d.compiled.prompt, `#${d.slot}`).toContain(`${VHD_CLOSING_BEAT} ${d.durationSec}s, vertical 9:16.`);
    }
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

  it("composes frame 0 as an unresolved pose, not a settled one", () => {
    for (const d of days) {
      expect(d.startFrame.prompt, `#${d.slot}`).toContain(
        d.openingStateOverride ?? HOOK_BEATS[d.plan.hookType].openingState
      );
    }
  });

  it("names the scene's own background and never a substituted one", () => {
    for (const d of days) {
      expect(d.startFrame.prompt, `#${d.slot}`).toContain(d.brief.spatial_setup);
    }
  });

  it("sends only the wardrobe the crop can actually show", () => {
    for (const d of days) {
      // Footwear and bare feet are never in any of these crops.
      expect(d.startFrame.prompt, `#${d.slot}`).not.toMatch(/\b(sandals|shoes|boots|heels|bare feet)\b/i);
      // Legwear only survives the waist-up crop, whose frame ends AT the waistband.
      if (d.plan.framing !== "medium_graphic") {
        expect(d.startFrame.prompt, `#${d.slot}`).not.toMatch(/\b(trousers|jeans|shorts|leggings)\b/i);
      }
      // The identity anchors are above the crop line and must always survive the filter.
      expect(d.startFrame.wardrobeVisible, `#${d.slot}`).toMatch(/gold chain/i);
      expect(d.startFrame.wardrobeVisible, `#${d.slot}`).toMatch(/hoop earrings/i);
    }
  });

  it("records the full lock and what was withheld, so the omission is auditable", () => {
    for (const d of days) {
      expect(d.startFrame.wardrobeLockFull, `#${d.slot}`).toBe(d.brief.wardrobe_lock);
      expect(d.startFrame.wardrobeOmitted.length, `#${d.slot}`).toBeGreaterThan(0);
      for (const clause of d.startFrame.wardrobeOmitted) {
        expect(d.brief.wardrobe_lock, `#${d.slot}`).toContain(clause);
      }
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

describe("the wardrobe filter", () => {
  const LOCK =
    "cream ribbed camisole (thin fixed straps, close to the body, no logo), soft charcoal knit lounge trousers (mid-rise, relaxed), bare feet, thin gold chain necklace, small gold hoop earrings, dark wavy hair loose";

  it("splits on top-level commas only, never inside a garment's own parentheses", () => {
    expect(splitWardrobeClauses(LOCK)).toEqual([
      "cream ribbed camisole (thin fixed straps, close to the body, no logo)",
      "soft charcoal knit lounge trousers (mid-rise, relaxed)",
      "bare feet",
      "thin gold chain necklace",
      "small gold hoop earrings",
      "dark wavy hair loose",
    ]);
  });

  it("drops legwear and footwear from a chest-up crop", () => {
    const r = visibleWardrobeFor(LOCK, "close_medium");
    expect(r.visible).not.toMatch(/trousers|bare feet/);
    expect(r.visible).toMatch(/camisole/);
    expect(r.omitted).toEqual(["soft charcoal knit lounge trousers (mid-rise, relaxed)", "bare feet"]);
  });

  it("drops legwear from the waist-up crop too, because naming it widened the frame", () => {
    // This test asserted the opposite until 2026-09-10. The reasoning was that a frame ending AT
    // the waist can show a waistband, so the trousers should be named. VHD #5's render settled it:
    // given a garment to depict, Soul V2 opened the crop to mid-thigh to depict it. The waistband
    // is now carried by the crop lines alone.
    const r = visibleWardrobeFor(LOCK, "medium_graphic");
    expect(r.visible).not.toMatch(/trousers/);
    expect(r.omitted).toEqual(["soft charcoal knit lounge trousers (mid-rise, relaxed)", "bare feet"]);
  });

  it("sends the lock whole rather than sending nothing when the filter matches everything", () => {
    const r = visibleWardrobeFor("black jeans, tan sandals", "close");
    expect(r.visible).toBe("black jeans, tan sandals");
    expect(r.omitted).toEqual([]);
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


describe("remediation v1.1 — the start frame moves closer to the payoff", () => {
  const byIdx = (n: number) => days.find((d) => d.slot === n)!;

  it("leaves VHD #1 completely alone — it is generated, scheduled, and is the control", () => {
    // Byte-for-byte against the strings its shipped asset was generated from on 2026-09-09. If the
    // control's prompt drifts, the control stops being comparable to the four arms it exists for.
    const d = byIdx(1);
    expect(d.compiled.prompt).toBe(
      "Close on her, camera static at eye height. She starts close to the lens, looking away to one side and holding it " +
        "there. Almost immediately her eyes travel back, find the lens, and stay there. Her hand comes up and she adjusts " +
        "the thin gold chain at her collarbone. She settles naturally and holds the look. 8s, vertical 9:16."
    );
    expect(d.openingStateOverride).toBeUndefined();
    expect(d.lockCamera).toBeUndefined();
    expect(d.compiled.prompt).not.toContain("Locked-off camera");
  });

  it("gives #2-#5 their own frame-0 pose and the camera lock", () => {
    for (const n of [2, 3, 4, 5]) {
      const d = byIdx(n);
      expect(d.openingStateOverride, `#${n}`).toBeTruthy();
      expect(d.lockCamera, `#${n}`).toBe(true);
      expect(d.compiled.prompt, `#${n}`).toContain("Locked-off camera, framing remains fixed throughout.");
    }
  });

  it("states the SAME frame-0 pose in the start frame and the motion prompt", () => {
    // The video is generated FROM the start frame. If the two disagree about where she starts, the
    // first thing the model does is correct the discrepancy — which is the runway being spent.
    for (const d of days) {
      const pose = d.openingStateOverride ?? HOOK_BEATS[d.plan.hookType].openingState;
      expect(d.startFrame.prompt, `#${d.slot} frame`).toContain(pose);
      expect(d.compiled.prompt, `#${d.slot} motion`).toContain(pose);
    }
  });

  it("keeps every arm's experiment assignment untouched", () => {
    // The remediation may move the pose and nothing else. Plan, motif, hook, role, duration fixed.
    expect(days.map((d) => d.plan.motifFamily)).toEqual([
      "intimate_face",
      "bold_color",
      "hard_light_shadow",
      "social_depth",
      "graphic_environment",
    ]);
    expect(days.map((d) => d.plan.hookType)).toEqual([
      "gaze_turn",
      "gaze_turn",
      "light_shift",
      "environment_reaction",
      "micro_action",
    ]);
    expect(days.map((d) => d.plan.experimentRole)).toEqual([
      "control",
      "challenger",
      "challenger",
      "challenger",
      "challenger",
    ]);
    expect(days.map((d) => d.durationSec)).toEqual([8, 8, 8, 8, 8]);
    expect(new Set(MOTIF_FAMILIES).size).toBe(5);
  });

  it("keeps #2's hook identical to the control's, which is the whole point of that arm", () => {
    expect(byIdx(2).plan.hookType).toBe(byIdx(1).plan.hookType);
    expect(byIdx(2).compiled.prompt).toContain(HOOK_BEATS.gaze_turn.hookBeat);
  });

  it("starts #2 and #4 off-lens rather than in it", () => {
    for (const n of [2, 4]) {
      const pose = byIdx(n).openingStateOverride!;
      expect(pose, `#${n}`).toMatch(/off the lens/i);
      expect(pose, `#${n}`).toMatch(/almost square to camera/i);
    }
    expect(byIdx(4).openingStateOverride!).toMatch(/no direct eye contact/i);
  });

  it("puts #3's light boundary on her eye line and lifts her gaze off the floor", () => {
    expect(byIdx(3).openingStateOverride!).toMatch(/edge of light.*eye line/i);
    expect(byIdx(3).openingStateOverride!).toMatch(/only very slightly/i);
    expect(byIdx(3).startFrame.prompt).toMatch(/Hard parallel bands of light and shadow run ACROSS HER FACE AND BODY/);
  });

  it("puts #5's fingers on the chain already and enforces a true waist-up crop", () => {
    expect(byIdx(5).openingStateOverride!).toMatch(/already resting lightly on the thin gold chain/i);
    expect(byIdx(5).startFrame.prompt).toMatch(/BOTTOM EDGE OF THE FRAME IS HER WAIST/);
    expect(byIdx(5).startFrame.prompt).toMatch(/No thighs/i);
    // The trousers are no longer named: naming them gave Soul a garment to depict and it opened
    // the crop to mid-thigh to depict it.
    const wearing = byIdx(5).startFrame.prompt.match(/Wearing: (.*?)\. Background:/)![1];
    expect(wearing).not.toMatch(/\btrousers\b/i);
    expect(byIdx(5).startFrame.negativePrompt).toContain("thighs");
  });

  it("demands a genuinely empty wall behind #2", () => {
    expect(byIdx(2).startFrame.prompt).toMatch(/ONE single flat surface of colour, edge to edge/);
    expect(byIdx(2).startFrame.prompt).toMatch(/is OUT OF FRAME/);
    for (const term of ["doorway", "picture frame", "houseplant", "furniture"]) {
      expect(byIdx(2).startFrame.negativePrompt, term).toContain(term);
    }
  });

  it("still passes the scene validator on every arm after the rewrite", () => {
    for (const d of days) {
      expect(d.compiled.validation.errors, `#${d.slot}: ${JSON.stringify(d.compiled.validation.errors)}`).toEqual([]);
    }
  });
});

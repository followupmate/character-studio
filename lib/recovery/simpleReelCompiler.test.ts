import { describe, it, expect } from "vitest";
import {
  compileFirestarterReel,
  compileSimpleReel,
  deriveAction,
  REEL_DURATION_MAX_SEC,
} from "@/lib/recovery/simpleReelCompiler";
import { RECOVERY_FIXTURES } from "@/lib/promptDirector/recoveryFixtures";
import { resolveSceneSemantics } from "@/lib/sceneSemantics";
import type { SceneBriefJson } from "@/lib/sceneBrief";

function briefFor(day: number): SceneBriefJson {
  const f = RECOVERY_FIXTURES.find((x) => x.day === day)!;
  return {
    camera_language: "static 50mm",
    color_palette: ["warm cream"],
    visual_rules: [],
    location_constraints: [],
    spatial_setup: f.spatialSetup,
    wardrobe_lock: f.wardrobeLock,
    allowed_props: f.allowedProps,
    lighting_state: "window light from the left",
    time_of_day: "morning",
    weather_implied: "clear",
  };
}

const scene = (day: number) => ({
  sceneBrief: briefFor(day),
  sceneLocation: RECOVERY_FIXTURES.find((x) => x.day === day)!.location,
});

describe("compileSimpleReel", () => {
  it("produces a prompt that passes its own auto-reel shape rules", () => {
    for (const f of RECOVERY_FIXTURES) {
      const out = compileSimpleReel({ ...scene(f.day), dayNumber: f.day });
      expect(
        out.validation.errors.map((e) => `${e.rule}: ${e.detail}`),
        `day ${f.day} scene compiled to a prompt its own validator rejects`
      ).toEqual([]);
      expect(out.validation.warnings.map((w) => w.rule)).toEqual([]);
    }
  });

  it("never stacks two gaze clauses in the opening line", () => {
    const out = compileFirestarterReel(scene(78));
    expect(out.prompt).toMatch(/looking away to one side\./);
    expect(out.prompt).not.toMatch(/looking away to one side, looking just off camera/);
    // and the default path still states where the gaze starts
    expect(compileSimpleReel(scene(78)).prompt).toMatch(/looking just off camera/);
  });

  it("puts the eye-contact beat inside the first second", () => {
    const out = compileSimpleReel(scene(78));
    expect(out.prompt).toMatch(/Within the first second her eyes find the lens/);
  });

  it("declares one duration in the 6–7s band and states the loop", () => {
    const out = compileSimpleReel(scene(78));
    expect(out.prompt).toMatch(/\b6s, vertical 9:16\.$/);
    expect(out.prompt).toMatch(/loops seamlessly/);
    expect(compileSimpleReel({ ...scene(78), durationSec: 7 }).prompt).toMatch(/\b7s,/);
  });

  it("rejects a duration outside the band rather than silently clamping it", () => {
    expect(() => compileSimpleReel({ ...scene(78), durationSec: 10 })).toThrow(/6–7s/);
    expect(() => compileSimpleReel({ ...scene(78), durationSec: 5 })).toThrow(/6–7s/);
    expect(() => compileSimpleReel({ ...scene(78), durationSec: REEL_DURATION_MAX_SEC })).not.toThrow();
  });

  it("carries none of the boilerplate layers the collapsed reels were made of", () => {
    const out = compileSimpleReel(scene(92));
    for (const banned of [
      /natural blinking/i,
      /subtle breathing/i,
      /minor posture shifts/i,
      /DEPTH & COMPOSITION/i,
      /liquid follows gravity/i,
      /smartphone microphone/i,
      /No environment jump/i,
      /reel_start_frame/i,
      /Kling \/ Seedance/i,
      /EXACT SPOKEN LINE/i,
    ]) {
      expect(out.prompt, `prompt still carries ${banned}`).not.toMatch(banned);
    }
  });

  it("keeps the whole prompt short — one shot, not a rulebook", () => {
    for (const f of RECOVERY_FIXTURES) {
      const out = compileSimpleReel({ ...scene(f.day), dayNumber: f.day });
      const words = out.prompt.trim().split(/\s+/).length;
      expect(words, `day ${f.day} prompt is ${words} words`).toBeLessThan(75);
    }
  });

  it("never asks for speech, text or a camera move in the positive prompt", () => {
    const out = compileSimpleReel(scene(90));
    expect(out.prompt).toMatch(/camera static/);
    expect(out.prompt).not.toMatch(/\b(says|speaks|spoken|overlay|text)\b/i);
    expect(out.negativePrompt).toMatch(/no speech/);
    expect(out.negativePrompt).toMatch(/no camera movement/);
  });
});

describe("action derivation is scene-legal by construction", () => {
  it("never emits the drinking beat when the scene has no drinking vessel", () => {
    const pilates = resolveSceneSemantics(briefFor(92), { activityHint: "sipping her coffee" });
    // force the class the hint would produce, then confirm the compiler refuses the object
    const s = { ...pilates, actionClass: "eating_drinking" as const };
    expect(deriveAction(s, 0)).not.toMatch(/cup|sip/i);
  });

  it("does emit the drinking beat when the vessel is genuinely in the brief", () => {
    const rooftop = resolveSceneSemantics(briefFor(89), {});
    const s = { ...rooftop, actionClass: "eating_drinking" as const };
    expect(deriveAction(s, 0)).toMatch(/sip/i);
  });

  it("never turns locomotion into 'continuing forward motion'", () => {
    const street = resolveSceneSemantics(briefFor(90), { activityHint: "she walks between two places" });
    expect(street.actionClass).toBe("locomotion");
    const action = deriveAction(street, 0);
    expect(action).toMatch(/one unhurried step|turns a quarter/);
    expect(action).not.toMatch(/continuing forward motion/);
  });

  it("gives a woman reclined in a car a stationary beat, not a walk", () => {
    const car = resolveSceneSemantics(briefFor(88), { sceneLocation: RECOVERY_FIXTURES.find((f) => f.day === 88)!.location });
    expect(car.actionClass).toBe("reclining");
    expect(deriveAction(car, 0)).not.toMatch(/step|walk/i);
  });

  it("rotates deterministically by day number instead of repeating or randomising", () => {
    const s = resolveSceneSemantics(briefFor(78), {});
    // consecutive days differ...
    expect(new Set([0, 1, 2, 3].map((d) => deriveAction(s, d))).size).toBeGreaterThan(1);
    // ...and the same day always yields the same beat, whatever the bank size is
    expect(deriveAction(s, 7)).toBe(deriveAction(s, 7));
    const bankSize = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((d) => deriveAction(s, d))).size;
    expect(deriveAction(s, bankSize)).toBe(deriveAction(s, 0));
    // negative / missing day numbers must not blow up or index out of range
    expect(deriveAction(s, -3)).toBeTruthy();
    expect(deriveAction(s, null)).toBeTruthy();
  });
});

describe("firestarter (Reel 1)", () => {
  const out = compileFirestarterReel(scene(78));

  it("matches the agreed shape exactly", () => {
    expect(out.prompt).toMatch(/looking away to one side/);
    expect(out.prompt).toMatch(/Within the first second her eyes find the lens and stay there/);
    expect(out.prompt).toMatch(/very slight asymmetric smile/);
    expect(out.prompt).toMatch(/strand of hair and the thin gold chain/);
    expect(out.prompt).toMatch(/She holds the look/);
    expect(out.prompt).toMatch(/loops seamlessly/);
    expect(out.prompt).toMatch(/6s, vertical 9:16/);
  });

  it("is close-medium and passes validation clean", () => {
    expect(out.framing).toBe("close_medium");
    expect(out.validation.errors).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { buildJudgeUserMessage, parseJudgeResponse } from "@/lib/promptDirector/semanticJudge";
import { RECOVERY_FIXTURES } from "@/lib/promptDirector/recoveryFixtures";

// Layer 2's contract is "strict JSON, nothing else". These tests pin the parser, not the model —
// the parser is what decides whether a bad response blocks generation, and it must never turn an
// unusable answer into a pass.

describe("parseJudgeResponse", () => {
  it("accepts the exact contracted shapes", () => {
    expect(parseJudgeResponse('{"verdict":"pass","violations":[]}')).toEqual({ verdict: "pass", violations: [] });
    expect(parseJudgeResponse('{"verdict":"fail","violations":[{"type":"prop","detail":"no cup in the scene"}]}')).toEqual({
      verdict: "fail",
      violations: [{ type: "prop", detail: "no cup in the scene" }],
    });
  });

  it("tolerates a markdown fence but nothing looser", () => {
    expect(parseJudgeResponse('```json\n{"verdict":"pass","violations":[]}\n```')?.verdict).toBe("pass");
    expect(parseJudgeResponse("Sure! The prompt looks fine to me.")).toBeNull();
    expect(parseJudgeResponse("")).toBeNull();
    expect(parseJudgeResponse('{"verdict":"maybe","violations":[]}')).toBeNull();
    expect(parseJudgeResponse("{not json")).toBeNull();
  });

  it("treats a fail with no usable violation as unparseable rather than a block", () => {
    expect(parseJudgeResponse('{"verdict":"fail","violations":[]}')).toBeNull();
    expect(parseJudgeResponse('{"verdict":"fail","violations":[{"type":"prop"}]}')).toBeNull();
  });

  it("coerces an out-of-contract violation type instead of dropping the finding", () => {
    const r = parseJudgeResponse('{"verdict":"fail","violations":[{"type":"vibes","detail":"she walks in a car"}]}');
    expect(r?.violations[0].type).toBe("action");
    expect(r?.violations[0].detail).toBe("she walks in a car");
  });
});

describe("buildJudgeUserMessage", () => {
  const pilates = RECOVERY_FIXTURES.find((f) => f.day === 92)!;

  it("states the object inventory as closed, so an invented prop is visible to the judge", () => {
    const msg = buildJudgeUserMessage({
      brief: { spatial_setup: pilates.spatialSetup, allowed_props: pilates.allowedProps, wardrobe_lock: pilates.wardrobeLock },
      prompt: pilates.prompt,
      sceneLocation: pilates.location,
    });
    expect(msg).toMatch(/the ONLY objects that exist here/);
    expect(msg).toMatch(/matte white water bottle/);
    expect(msg).toMatch(/MOTION PROMPT/);
    expect(msg).toMatch(/liquid follows gravity/);
  });

  it("says 'none' rather than omitting the line when the scene has no props", () => {
    const positano = RECOVERY_FIXTURES.find((f) => f.day === 93)!;
    const msg = buildJudgeUserMessage({
      brief: { spatial_setup: positano.spatialSetup, allowed_props: positano.allowedProps },
      prompt: positano.prompt,
    });
    expect(msg).toMatch(/Objects present \(the ONLY objects that exist here\): none/);
  });

  it("separates wardrobe from props so worn items are never read as manipulable objects", () => {
    const msg = buildJudgeUserMessage({
      brief: { spatial_setup: pilates.spatialSetup, allowed_props: pilates.allowedProps, wardrobe_lock: pilates.wardrobeLock },
      prompt: pilates.prompt,
    });
    expect(msg).toMatch(/Wardrobe \(worn, not props\)/);
  });
});

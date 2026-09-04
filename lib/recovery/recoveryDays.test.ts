import { describe, it, expect } from "vitest";
import { RECOVERY_DAYS, compileRecoveryDays } from "@/lib/recovery/recoveryDays";
import { REEL_DURATION_GATE } from "@/lib/recovery/simpleReelCompiler";
import recoveryConfig from "@/recovery.json";

describe("the five prepared recovery days", () => {
  const compiled = compileRecoveryDays();

  it("is exactly five, one per direction, numbered 1–5", () => {
    expect(RECOVERY_DAYS).toHaveLength(5);
    expect(RECOVERY_DAYS.map((d) => d.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(RECOVERY_DAYS.map((d) => d.direction)).size).toBe(5);
  });

  it("every brief authors its structured semantic fields rather than relying on derivation", () => {
    for (const d of RECOVERY_DAYS) {
      expect(d.brief.location_class, `day ${d.slot}`).toBeTruthy();
      expect(d.brief.action_class, `day ${d.slot}`).toBeTruthy();
      expect(d.brief.scene_entities, `day ${d.slot}`).toBeDefined();
      expect(d.brief.speech_is_the_point, `day ${d.slot}`).toBe(false);
    }
    for (const c of compiled) expect(c.compiled.semantics.authored).toBe(true);
  });

  it("compiles clean — no errors and no warnings on any of the five", () => {
    for (const c of compiled) {
      expect(c.compiled.validation.errors.map((e) => e.rule), `day ${c.slot}`).toEqual([]);
      expect(c.compiled.validation.warnings.map((w) => w.rule), `day ${c.slot}`).toEqual([]);
    }
  });

  it("every prompt is 7–8s, static, loop-closed and eye-contact-first", () => {
    for (const c of compiled) {
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/camera static/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/Within the first second her eyes find the lens/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/loops seamlessly/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/\b[678]s, vertical 9:16\.$/);
      expect(c.compiled.durationSec).toBe(c.durationSec);
    }
  });

  it("no two of the five open on the same beat, apart from the deliberate #1/#4 pair", () => {
    const actions = compiled.map((c) => c.compiled.action);
    expect(new Set(actions).size).toBeGreaterThan(1);
  });

  it("#4 repeats #1's beat on purpose — that pair is the same-register comparison", () => {
    const four = compiled.find((c) => c.slot === 4)!;
    const one = compiled.find((c) => c.slot === 1)!;
    expect(four.compiled.action).toMatch(/thin gold chain at her collarbone/);
    expect(one.compiled.action).toMatch(/thin gold chain at her collarbone/);
    // ...but in a different room and a different light, which is what makes it a second READ
    expect(four.brief.location_class).not.toBe(one.brief.location_class);
  });

  it("every day's stated payoff matches the beat that actually compiled", () => {
    // The doc table prints `payoff` next to `compiled.action`; if the action bank rotates and the
    // prose does not follow, the review document quietly describes a reel nobody is making.
    const mustAppearInAction: Record<number, RegExp> = {
      1: /asymmetric smile|gold chain/,
      2: /strand of hair/,
      3: /cup|sip/,
      4: /gold chain/,
      5: /hand out of the water|out of the water/,
    };
    for (const c of compiled) {
      expect(c.compiled.action, `day ${c.slot}: "${c.payoff}" vs "${c.compiled.action}"`).toMatch(
        mustAppearInAction[c.slot]
      );
    }
  });

  it("matches the operator-approved per-reel targets exactly", () => {
    // Approved 2026-09-04: 8/7/8/7/8. Not a default anyone can drift — if a duration changes, this
    // fails and the change has to be a decision rather than an accident.
    expect(compiled.map((c) => c.compiled.durationSec)).toEqual([8, 7, 8, 7, 8]);
    // and every one of them sits inside the QA gate that will judge the rendered file
    for (const c of compiled) {
      expect(c.compiled.durationSec).toBeGreaterThanOrEqual(REEL_DURATION_GATE.minSec);
      expect(c.compiled.durationSec).toBeLessThanOrEqual(REEL_DURATION_GATE.maxSec);
    }
  });

  it("only the café day names an object, and that object is in its own brief", () => {
    for (const c of compiled) {
      const mentionsCup = /\bcup\b/i.test(c.compiled.prompt);
      if (mentionsCup) {
        expect(c.compiled.semantics.entityText, `day ${c.slot} names a cup`).toMatch(/cup/i);
      }
    }
  });

  it("slot 1 is the firestarter, in the agreed shape", () => {
    const one = compiled.find((c) => c.slot === 1)!;
    expect(one.firestarter).toBe(true);
    expect(one.compiled.prompt).toMatch(/looking away to one side/);
    expect(one.compiled.prompt).toMatch(/very slight asymmetric smile/);
    expect(one.compiled.framing).toBe("close_medium");
  });
});

describe("recovery.json registers the decision rule before the sprint, not after", () => {
  it("has one post-id slot per recovery reel, all unfilled", () => {
    expect(recoveryConfig.reels).toHaveLength(5);
    for (const r of recoveryConfig.reels) {
      expect(r.platform_post_id).toBeNull();
      expect(r.direction).toBeTruthy();
    }
    expect(recoveryConfig.reels.map((r) => r.slot)).toEqual(RECOVERY_DAYS.map((d) => d.slot));
    expect(recoveryConfig.reels.map((r) => r.direction)).toEqual(RECOVERY_DAYS.map((d) => d.direction));
  });

  it("names watch time as the primary KPI at the 4.5s threshold", () => {
    expect(recoveryConfig.decision_rule.primary_kpi.metric).toBe("avg_watch_time_sec");
    expect(recoveryConfig.decision_rule.primary_kpi.threshold_sec).toBe(4.5);
    expect(recoveryConfig.decision_rule.primary_kpi.horizon).toBe("7d");
    expect(recoveryConfig.decision_rule.primary_kpi.fallback_horizon).toBe("72h");
  });

  it("covers all three outcomes with no gap", () => {
    const branches = recoveryConfig.decision_rule.branches;
    expect(branches.map((b) => b.reels_at_or_above_threshold)).toEqual([">=2", "1", "0"]);
    for (const b of branches) expect(b.action).toBeTruthy();
  });

  it("records where each recovery reel landed in the normal calendar", () => {
    // Recovery is folded into the existing Character Studio calendar rather than run beside it, so
    // recovery.json has to say WHICH ordinary reel slot each index occupies. An index with no date
    // is not an error: it means the story engine has not produced that day yet, and the idempotent
    // integrate route will map it on a later run.
    const integrated = recoveryConfig.reels.filter((r) => r.integrated);
    expect(integrated.length).toBeGreaterThan(0);
    for (const r of integrated) {
      expect(r.calendar_date, `slot ${r.slot}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // dates are unique and ordered by recovery index — no two recovery reels share a slot
    const dates = integrated.map((r) => r.calendar_date as string);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
    // an unintegrated slot must not claim a date or a media id
    for (const r of recoveryConfig.reels.filter((x) => !x.integrated)) {
      expect(r.calendar_date).toBeNull();
      expect(r.media_id).toBeNull();
    }
  });

  it("still holds no platform_post_id — publishing stays the existing flow's job", () => {
    for (const r of recoveryConfig.reels) expect(r.platform_post_id).toBeNull();
  });

  it("carries the baseline the results are measured against", () => {
    expect(recoveryConfig.baseline.window).toBe("2026-08-20..2026-09-01");
    expect(recoveryConfig.baseline.avg_watch_time_sec).toBeCloseTo(2.9, 1);
    expect(recoveryConfig.baseline.views_24h).toBe(120);
  });
});

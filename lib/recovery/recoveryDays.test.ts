import { describe, it, expect } from "vitest";
import { RECOVERY_DAYS, compileRecoveryDays } from "@/lib/recovery/recoveryDays";
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

  it("every prompt is 6–7s, static, loop-closed and eye-contact-first", () => {
    for (const c of compiled) {
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/camera static/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/Within the first second her eyes find the lens/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/loops seamlessly/);
      expect(c.compiled.prompt, `day ${c.slot}`).toMatch(/\b[67]s, vertical 9:16\.$/);
      expect(c.compiled.durationSec).toBe(c.durationSec);
    }
  });

  it("no two of the five open on the same beat — this is a five-point test, not one shot repeated", () => {
    const actions = compiled.map((c) => c.compiled.action);
    expect(new Set(actions).size).toBeGreaterThan(1);
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

  it("carries the baseline the results are measured against", () => {
    expect(recoveryConfig.baseline.window).toBe("2026-08-20..2026-09-01");
    expect(recoveryConfig.baseline.avg_watch_time_sec).toBeCloseTo(2.9, 1);
    expect(recoveryConfig.baseline.views_24h).toBe(120);
  });
});

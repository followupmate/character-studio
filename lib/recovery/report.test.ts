import { describe, it, expect } from "vitest";
import {
  buildRecoveryReport,
  renderRecoveryReport,
  selectBranch,
  type RecoveryConfig,
  type SnapshotRow,
} from "@/lib/recovery/report";
import rawConfig from "@/recovery.json";

const CONFIG = rawConfig as unknown as RecoveryConfig;

function snap(horizon: string, over: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    horizon,
    views: 200,
    reach: 160,
    likes: 6,
    comments: 0,
    saves: 1,
    shares: 0,
    total_interactions: 7,
    avg_watch_time_sec: null,
    follows: null,
    profile_visits: null,
    ...over,
  };
}

/**
 * Publishes n reels and gives the first `passing` of them a 7d watch time above the threshold.
 * Every published reel also gets the FULL required metric panel — since 2026-09-04 a reel without
 * it never reaches "measured", so a scenario missing it would silently test nothing.
 */
function scenario(published: number, passing: number, watchSec = 5.2) {
  const config: RecoveryConfig = {
    ...CONFIG,
    reels: CONFIG.reels.map((r, i) =>
      i < published ? { ...r, platform_post_id: `ig_${r.slot}`, posted_at: "2026-09-05" } : r
    ),
  };
  const map = new Map<string, SnapshotRow[]>();
  const engagement = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < published; i++) {
    const id = `ig_${config.reels[i].slot}`;
    const watch = i < passing ? watchSec : 2.4;
    map.set(id, [
      snap("24h", { views: 260 }),
      snap("72h", { avg_watch_time_sec: watch }),
      snap("7d", { avg_watch_time_sec: watch }),
    ]);
    engagement.set(id, {
      avg_watch_time_sec: watch,
      actual_video_duration_sec: 8,
      avg_watch_ratio: Math.round((watch / 8) * 1000) / 1000,
    });
  }
  return { config, map, engagement };
}

const build = (sc: ReturnType<typeof scenario>) => buildRecoveryReport(sc.config, sc.map, sc.engagement);

describe("recovery report", () => {
  it("reports every reel as unpublished before the sprint starts", () => {
    const report = buildRecoveryReport(CONFIG, new Map());
    expect(report.published).toBe(0);
    expect(report.measured).toBe(0);
    expect(report.reels.every((r) => r.status === "not_published")).toBe(true);
    expect(report.decision).toBeNull();
    expect(report.decisionPending).toMatch(/five-reel rule/);
  });

  it("compares each reel to the 20.8.–1.9. baseline", () => {
    const r = build(scenario(1, 1, 5.2)).reels[0];
    expect(r.kpiWatchTimeSec).toBe(5.2);
    expect(r.kpiHorizonUsed).toBe("7d");
    // baseline watch 2.9s, baseline 24h views 120
    expect(r.vsBaseline.watchTimeDeltaSec).toBeCloseTo(2.3, 2);
    expect(r.vsBaseline.views24hDelta).toBe(140);
  });

  it("falls back to 72h only when 7d is not there yet, and never substitutes 24h", () => {
    const config: RecoveryConfig = {
      ...CONFIG,
      reels: CONFIG.reels.map((r, i) => (i === 0 ? { ...r, platform_post_id: "ig_1" } : r)),
    };
    const engagement = new Map<string, Record<string, unknown>>([
      ["ig_1", { actual_video_duration_sec: 8, avg_watch_ratio: 0.6 }],
    ]);
    const map = new Map<string, SnapshotRow[]>([
      ["ig_1", [snap("24h", { avg_watch_time_sec: 9.9 }), snap("72h", { avg_watch_time_sec: 4.8 })]],
    ]);
    const r = buildRecoveryReport(config, map, engagement).reels[0];
    expect(r.kpiHorizonUsed).toBe("72h");
    expect(r.kpiWatchTimeSec).toBe(4.8);

    // 24h alone is not a KPI reading, however tempting the number is
    const only24h = new Map<string, SnapshotRow[]>([["ig_1", [snap("24h", { avg_watch_time_sec: 9.9 })]]]);
    const r2 = buildRecoveryReport(config, only24h, engagement).reels[0];
    expect(r2.kpiWatchTimeSec).toBeNull();
    expect(r2.status).toBe("awaiting_data");
  });

  it("does not evaluate the rule until all five reels are measured", () => {
    for (const published of [1, 2, 3, 4]) {
      const report = build(scenario(published, published));
      expect(report.decision, `${published} reels in`).toBeNull();
      expect(report.decisionPending).toMatch(new RegExp(`${published}/5 reels measured`));
    }
  });

  it("applies the committed rule exactly, on all three branches", () => {
    const reportFor = (passing: number) => build(scenario(5, passing));

    const twoOfFive = reportFor(2);
    expect(twoOfFive.atOrAboveThreshold).toBe(2);
    expect(twoOfFive.decision?.branch).toBe(">=2");
    expect(twoOfFive.decision?.action).toMatch(/CI_SCORING_FROZEN stays true for a further 14 days/);

    const oneOfFive = reportFor(1);
    expect(oneOfFive.decision?.branch).toBe("1");
    expect(oneOfFive.decision?.action).toMatch(/Extend the sprint by 3 more reels/);

    const noneOfFive = reportFor(0);
    expect(noneOfFive.decision?.branch).toBe("0");
    expect(noneOfFive.decision?.action).toMatch(/VISUAL MOTIF layer/);
  });

  it("treats 4.5s as passing — the threshold is inclusive", () => {
    expect(build(scenario(5, 5, 4.5)).atOrAboveThreshold).toBe(5);
    expect(build(scenario(5, 5, 4.49)).atOrAboveThreshold).toBe(0);
  });

  it("selectBranch covers every count from 0 to 5 with no gap", () => {
    for (let n = 0; n <= 5; n++) expect(selectBranch(CONFIG, n), `n=${n}`).not.toBeNull();
  });
});

describe("the verdict is never a single number (rule set 2026-09-04)", () => {
  it("will not call a reel measured on avg_watch_time alone", () => {
    // A watch time with no duration, no ratio, no reach/saves/shares is exactly the single-number
    // verdict the operator ruled out.
    const { config, map } = scenario(5, 5);
    const watchOnly = new Map<string, Record<string, unknown>>(
      config.reels.map((r) => [`ig_${r.slot}`, { avg_watch_time_sec: 5.2 }])
    );
    const report = buildRecoveryReport(config, map, watchOnly);
    expect(report.measured).toBe(0);
    expect(report.decision).toBeNull();
    expect(report.decisionPending).toMatch(/required metric panel/);
    expect(report.reels[0].required.missing).toContain("actual_video_duration_sec");
    expect(report.reels[0].required.missing).toContain("avg_watch_ratio");
  });

  it("names the missing metrics per reel rather than just refusing", () => {
    const { config, map } = scenario(5, 5);
    const partial = new Map<string, Record<string, unknown>>(
      config.reels.map((r) => [`ig_${r.slot}`, { avg_watch_time_sec: 5.2, actual_video_duration_sec: 8 }])
    );
    const report = buildRecoveryReport(config, map, partial);
    expect(report.decisionPending).toMatch(/#1 missing avg_watch_ratio/);
  });

  it("reports every required metric and prints them next to the verdict", () => {
    const report = build(scenario(5, 3));
    expect(report.requiredMetrics).toEqual([
      "avg_watch_time_sec",
      "actual_video_duration_sec",
      "avg_watch_ratio",
      "reach",
      "saves",
      "shares",
    ]);
    for (const r of report.reels) {
      expect(r.required.complete, `#${r.slot}: missing ${r.required.missing.join(", ")}`).toBe(true);
      expect(r.required.values.reach).toBe(160);
      expect(r.required.values.saves).toBe(1);
      expect(r.required.values.shares).toBe(0);
      expect(r.required.values.actual_video_duration_sec).toBe(8);
    }
    expect(report.decision!.supporting.totalReach).toBe(800);
    expect(report.decision!.supporting.medianDurationSec).toBe(8);
    expect(report.decision!.supporting.medianWatchRatio).toBeGreaterThan(0);

    const text = renderRecoveryReport(report);
    expect(text).toMatch(
      /required alongside the verdict: avg_watch_time_sec, actual_video_duration_sec, avg_watch_ratio, reach, saves, shares/
    );
    expect(text).toMatch(/read with: median ratio .+ · median duration 8s · reach 800/);
  });

  it("counts a genuine zero as measured — 0 is a measurement, absent is not", () => {
    const sc = scenario(5, 5);
    for (const [, e] of sc.engagement) e.avg_watch_ratio = 0;
    const report = build(sc);
    expect(report.measured).toBe(5);
    expect(report.reels[0].required.missing).toEqual([]);
  });

  it("reads the panel off the SAME horizon the KPI came from", () => {
    const config: RecoveryConfig = {
      ...CONFIG,
      reels: CONFIG.reels.map((r, i) => (i === 0 ? { ...r, platform_post_id: "ig_1" } : r)),
    };
    const map = new Map<string, SnapshotRow[]>([
      [
        "ig_1",
        [snap("24h", { reach: 999, saves: 99 }), snap("72h", { avg_watch_time_sec: 4.8, reach: 111, saves: 2 })],
      ],
    ]);
    const engagement = new Map<string, Record<string, unknown>>([
      ["ig_1", { actual_video_duration_sec: 8, avg_watch_ratio: 0.6 }],
    ]);
    const r = buildRecoveryReport(config, map, engagement).reels[0];
    expect(r.kpiHorizonUsed).toBe("72h");
    // the 24h numbers must not leak into a panel describing a 72h verdict
    expect(r.required.values.reach).toBe(111);
    expect(r.required.values.saves).toBe(2);
  });
});

describe("watch retention passthrough", () => {
  it("carries the retention block through from engagement, display-only", () => {
    const { config, map } = scenario(1, 1, 5.2);
    const engagement = new Map<string, Record<string, unknown>>([
      [
        "ig_1",
        {
          avg_watch_time_sec: 5.2,
          video_view_total_time_sec: 900.5,
          actual_video_duration_sec: 7,
          avg_watch_ratio: 0.743,
        },
      ],
    ]);
    const r = buildRecoveryReport(config, map, engagement).reels[0];
    expect(r.watch.actual_video_duration_sec).toBe(7);
    expect(r.watch.avg_watch_ratio).toBe(0.743);
    expect(r.watch.video_view_total_time_sec).toBe(900.5);
    expect(r.watch.avg_watch_ratio_exceeds_one).toBe(false);
    // the ratio is NOT part of the threshold test — the KPI is still avg watch time
    expect(r.meetsThreshold).toBe(true);
  });

  it("surfaces a ratio above 1 as a replay signal rather than hiding or clamping it", () => {
    const { config, map } = scenario(1, 1, 5.2);
    const engagement = new Map<string, Record<string, unknown>>([
      [
        "ig_1",
        {
          avg_watch_time_sec: 8.4,
          actual_video_duration_sec: 7,
          avg_watch_ratio: 1.2,
          avg_watch_ratio_exceeds_one: true,
        },
      ],
    ]);
    const report = buildRecoveryReport(config, map, engagement);
    expect(report.reels[0].watch.avg_watch_ratio).toBe(1.2);
    expect(report.reels[0].watch.avg_watch_ratio_exceeds_one).toBe(true);
    expect(renderRecoveryReport(report)).toMatch(/ratio > 1 — replays, not an error/);
  });

  it("renders retention as em dashes when nothing was measured", () => {
    const { config, map } = scenario(1, 1);
    const text = renderRecoveryReport(buildRecoveryReport(config, map));
    expect(text).toMatch(/retention\s+watch — \/ dur — = ratio — · total watch —/);
  });

  it("renders a readable standup block", () => {
    const text = renderRecoveryReport(build(scenario(5, 3)));
    expect(text).toMatch(/RECOVERY REPORT/);
    expect(text).toMatch(/baseline \(2026-08-20\.\.2026-09-01\): watch 2\.9s/);
    expect(text).toMatch(/KPI: avg_watch_time_sec >= 4\.5s @ 7d/);
    expect(text).toMatch(/at or above threshold 3\/5/);
    expect(text).toMatch(/DECISION \(>=2\)/);
    // NULL columns render as an em dash rather than as 0 — a metric we cannot read is not a zero
    expect(text).toMatch(/follows — · visits —/);
  });
});

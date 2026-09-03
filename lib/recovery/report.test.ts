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

/** Publishes n reels and gives the first `passing` of them a 7d watch time above the threshold. */
function scenario(published: number, passing: number, watchSec = 5.2) {
  const config: RecoveryConfig = {
    ...CONFIG,
    reels: CONFIG.reels.map((r, i) => (i < published ? { ...r, platform_post_id: `ig_${r.slot}`, posted_at: "2026-09-05" } : r)),
  };
  const map = new Map<string, SnapshotRow[]>();
  for (let i = 0; i < published; i++) {
    const id = `ig_${config.reels[i].slot}`;
    map.set(id, [
      snap("24h", { views: 260 }),
      snap("72h", { avg_watch_time_sec: i < passing ? watchSec : 2.4 }),
      snap("7d", { avg_watch_time_sec: i < passing ? watchSec : 2.4 }),
    ]);
  }
  return { config, map };
}

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
    const { config, map } = scenario(1, 1, 5.2);
    const r = buildRecoveryReport(config, map).reels[0];
    expect(r.kpiWatchTimeSec).toBe(5.2);
    expect(r.kpiHorizonUsed).toBe("7d");
    // baseline watch 2.9s, baseline 24h views 120
    expect(r.vsBaseline.watchTimeDeltaSec).toBeCloseTo(2.3, 2);
    expect(r.vsBaseline.views24hDelta).toBe(140);
  });

  it("falls back to 72h only when 7d is not there yet, and never substitutes 24h", () => {
    const map = new Map<string, SnapshotRow[]>([
      ["ig_1", [snap("24h", { avg_watch_time_sec: 9.9 }), snap("72h", { avg_watch_time_sec: 4.8 })]],
    ]);
    const config: RecoveryConfig = {
      ...CONFIG,
      reels: CONFIG.reels.map((r, i) => (i === 0 ? { ...r, platform_post_id: "ig_1" } : r)),
    };
    const r = buildRecoveryReport(config, map).reels[0];
    expect(r.kpiHorizonUsed).toBe("72h");
    expect(r.kpiWatchTimeSec).toBe(4.8);

    // 24h alone is not a KPI reading, however tempting the number is
    const only24h = new Map<string, SnapshotRow[]>([["ig_1", [snap("24h", { avg_watch_time_sec: 9.9 })]]]);
    const r2 = buildRecoveryReport(config, only24h).reels[0];
    expect(r2.kpiWatchTimeSec).toBeNull();
    expect(r2.status).toBe("awaiting_data");
  });

  it("does not evaluate the rule until all five reels are measured", () => {
    for (const published of [1, 2, 3, 4]) {
      const { config, map } = scenario(published, published);
      const report = buildRecoveryReport(config, map);
      expect(report.decision, `${published} reels in`).toBeNull();
      expect(report.decisionPending).toMatch(new RegExp(`${published}/5 reels measured`));
    }
  });

  it("applies the committed rule exactly, on all three branches", () => {
    const reportFor = (passing: number) => {
      const { config, map } = scenario(5, passing);
      return buildRecoveryReport(config, map);
    };

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
    const { config, map } = scenario(5, 5, 4.5);
    expect(buildRecoveryReport(config, map).atOrAboveThreshold).toBe(5);
    const near = scenario(5, 5, 4.49);
    expect(buildRecoveryReport(near.config, near.map).atOrAboveThreshold).toBe(0);
  });

  it("selectBranch covers every count from 0 to 5 with no gap", () => {
    for (let n = 0; n <= 5; n++) expect(selectBranch(CONFIG, n), `n=${n}`).not.toBeNull();
  });

  it("renders a readable standup block", () => {
    const { config, map } = scenario(5, 3);
    const text = renderRecoveryReport(buildRecoveryReport(config, map));
    expect(text).toMatch(/RECOVERY REPORT/);
    expect(text).toMatch(/baseline \(2026-08-20\.\.2026-09-01\): watch 2\.9s/);
    expect(text).toMatch(/KPI: avg_watch_time_sec >= 4\.5s @ 7d/);
    expect(text).toMatch(/at or above threshold 3\/5/);
    expect(text).toMatch(/DECISION \(>=2\)/);
    // NULL columns render as an em dash rather than as 0 — a metric we cannot read is not a zero
    expect(text).toMatch(/follows — · visits —/);
  });
});

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  bandFor24hReach,
  buildVhdPanel,
  buildVhdReelReport,
  buildVhdReport,
  evaluateRetentionFloor,
  renderVhdReport,
  VHD_METRICS,
  VHD_RETENTION_FLOOR,
  type VhdReelInput,
  type VhdSnapshot,
} from "@/lib/experiments/visualHookEval";

const snap = (horizon: string, over: Partial<VhdSnapshot> = {}): VhdSnapshot => ({
  horizon,
  views: 70,
  reach: 44,
  saves: 0,
  shares: 0,
  total_interactions: 4,
  avg_watch_time_sec: 6.4,
  ...over,
});

const reel = (over: Partial<VhdReelInput> = {}): VhdReelInput => ({
  index: 1,
  direction: "control",
  motifFamily: "intimate_face",
  hookType: "gaze_turn",
  experimentRole: "control",
  calendarDate: "2026-09-10",
  platformPostId: "123",
  postedAt: "2026-09-10T10:00:00Z",
  snapshots: [snap("24h"), snap("72h", { reach: 62, views: 96, avg_watch_time_sec: 6.42 })],
  actualDurationSec: 8.04,
  ...over,
});

describe("missing is never zero", () => {
  it("reports an absent metric as null and lists it as missing", () => {
    const p = buildVhdPanel("24h", snap("24h", { saves: null, shares: null }), 8.04);
    expect(p.values.saves).toBeNull();
    expect(p.values.shares).toBeNull();
    expect(p.missing).toEqual(["saves", "shares"]);
    expect(p.complete).toBe(false);
  });

  it("keeps a real zero as a measurement", () => {
    const p = buildVhdPanel("24h", snap("24h", { saves: 0 }), 8.04);
    expect(p.values.saves).toBe(0);
    expect(p.missing).not.toContain("saves");
  });

  it("produces no ratio at all without a usable duration", () => {
    for (const d of [null, undefined, 0, -1]) {
      const p = buildVhdPanel("24h", snap("24h"), d as number | null);
      expect(p.values.avg_watch_ratio, `duration ${d}`).toBeNull();
      expect(p.values.actual_video_duration_sec, `duration ${d}`).toBeNull();
    }
  });

  it("renders a missing value as a dash, never as 0", () => {
    const r = buildVhdReelReport(reel({ snapshots: [snap("24h", { reach: null })] }));
    const text = renderVhdReport(buildVhdReport([r], "v1"));
    expect(text).toMatch(/reach —/);
    expect(text).not.toMatch(/reach 0 /);
  });
});

describe("horizons are not mixed", () => {
  it("derives each horizon's ratio from that horizon's own watch time", () => {
    const r = buildVhdReelReport(
      reel({
        snapshots: [snap("24h", { avg_watch_time_sec: 4.0 }), snap("72h", { avg_watch_time_sec: 6.4 })],
        actualDurationSec: 8.0,
      })
    );
    expect(r.panels["24h"].values.avg_watch_ratio).toBe(0.5);
    expect(r.panels["72h"].values.avg_watch_ratio).toBe(0.8);
  });

  it("tags every panel with the horizon it came from", () => {
    const r = buildVhdReelReport(reel());
    expect(r.panels["24h"].horizon).toBe("24h");
    expect(r.panels["72h"].horizon).toBe("72h");
  });

  it("leaves a horizon's panel empty rather than borrowing the other's numbers", () => {
    const r = buildVhdReelReport(reel({ snapshots: [snap("24h")] }));
    expect(r.panels["72h"].values.reach).toBeNull();
    expect(r.panels["72h"].missing.length).toBe(VHD_METRICS.length - 1); // duration is horizon-free
  });

  it("shares only the file's own duration across horizons", () => {
    const r = buildVhdReelReport(reel({ snapshots: [snap("24h")] }));
    expect(r.panels["72h"].values.actual_video_duration_sec).toBe(8.04);
  });

  it("never clamps a ratio above 1 — replays are real", () => {
    const p = buildVhdPanel("24h", snap("24h", { avg_watch_time_sec: 9.0 }), 8.0);
    expect(p.values.avg_watch_ratio).toBe(1.125);
    expect(p.ratioExceedsOne).toBe(true);
  });
});

describe("the distribution diagnostic", () => {
  it("bands 24h reach exactly on the agreed boundaries", () => {
    expect(bandFor24hReach(0)).toBe("weak");
    expect(bandFor24hReach(39)).toBe("weak");
    expect(bandFor24hReach(40)).toBe("improving");
    expect(bandFor24hReach(63)).toBe("improving");
    expect(bandFor24hReach(64)).toBe("meaningful");
    expect(bandFor24hReach(99)).toBe("meaningful");
    expect(bandFor24hReach(100)).toBe("strong");
    expect(bandFor24hReach(450)).toBe("strong");
  });

  it("bands nothing when reach was not measured", () => {
    expect(bandFor24hReach(null)).toBeNull();
    expect(bandFor24hReach(undefined)).toBeNull();
  });

  it("places every recovery reel where the operator's own reading put it", () => {
    // The measured 24h reach of recovery #1–#4: 44, 24, 19, 28.
    expect([44, 24, 19, 28].map(bandFor24hReach)).toEqual(["improving", "weak", "weak", "weak"]);
  });

  it("bands only 24h reach — a 72h figure is never graded", () => {
    const r = buildVhdReelReport(reel({ snapshots: [snap("72h", { reach: 120 })] }));
    expect(r.distribution.reach24h).toBeNull();
    expect(r.distribution.band).toBeNull();
  });
});

describe("the retention floor", () => {
  it("prefers the more mature horizon", () => {
    const v = evaluateRetentionFloor({
      "24h": buildVhdPanel("24h", snap("24h", { avg_watch_time_sec: 4.0 }), 8.0),
      "72h": buildVhdPanel("72h", snap("72h", { avg_watch_time_sec: 6.4 }), 8.0),
    });
    expect(v.horizonUsed).toBe("72h");
    expect(v.ratio).toBe(0.8);
    expect(v.passes).toBe(true);
  });

  it("distinguishes not-measured from below-the-floor", () => {
    const notMeasured = evaluateRetentionFloor({
      "24h": buildVhdPanel("24h", null, 8.0),
      "72h": buildVhdPanel("72h", null, 8.0),
    });
    expect(notMeasured.passes).toBeNull();

    const below = evaluateRetentionFloor({
      "24h": buildVhdPanel("24h", snap("24h", { avg_watch_time_sec: 4.0 }), 8.0),
      "72h": buildVhdPanel("72h", null, 8.0),
    });
    expect(below.passes).toBe(false);
    expect(below.horizonUsed).toBe("24h");
  });

  it("uses the floor the brief set", () => {
    expect(VHD_RETENTION_FLOOR).toBe(0.65);
    // Every recovery ratio cleared it, which is why it is a floor and not a target.
    for (const r of [0.795, 0.757, 0.704, 0.868, 0.753]) expect(r).toBeGreaterThanOrEqual(VHD_RETENTION_FLOOR);
  });
});

describe("the five-arm comparison", () => {
  const five = (reachByIndex: Array<number | null>) =>
    reachByIndex.map((reach, i) =>
      buildVhdReelReport(
        reel({
          index: i + 1,
          experimentRole: i === 0 ? "control" : "challenger",
          snapshots: reach === null ? [] : [snap("24h", { reach })],
        })
      )
    );

  it("stays pending until every arm has a complete 24h panel", () => {
    const rep = buildVhdReport(five([44, 60, null, 30, 20]), "v1");
    expect(rep.comparison).toBeNull();
    expect(rep.pending).toMatch(/4\/5 arms measured/);
    expect(rep.pending).toMatch(/#3 missing/);
  });

  it("compares challengers against the control once all five are in", () => {
    const rep = buildVhdReport(five([44, 90, 30, 44, 120]), "v1");
    expect(rep.measured).toBe(5);
    expect(rep.comparison?.control?.reach24h).toBe(44);
    expect(rep.comparison?.challengers.map((c) => c.reachDeltaVsControl)).toEqual([46, -14, 0, 76]);
    expect(rep.comparison?.challengers.map((c) => c.band)).toEqual(["meaningful", "weak", "improving", "strong"]);
  });

  it("flags an arm that bought reach by breaking retention", () => {
    const reels = five([44, 200, 30, 44, 20]);
    reels[1] = buildVhdReelReport(
      reel({
        index: 2,
        experimentRole: "challenger",
        snapshots: [snap("24h", { reach: 200, avg_watch_time_sec: 3.0 })],
      })
    );
    const rep = buildVhdReport(reels, "v1");
    expect(rep.comparison?.challengers[0].retentionHeld).toBe(false);
    expect(renderVhdReport(rep)).toMatch(/RETENTION BROKE/);
  });

  it("says out loud that it is not a scoring input", () => {
    const rep = buildVhdReport(five([44, 60, 30, 44, 20]), "v1");
    expect(rep.notForScoring).toBe(true);
    expect(renderVhdReport(rep)).toMatch(/not an input to CI scoring/);
  });
});

describe("the experiment layer is quarantined from scoring", () => {
  it("is imported by nothing in the scoring or intelligence paths", () => {
    // The rule was explicit: these thresholds are for reading an experiment, never for ranking
    // content. A comment cannot enforce that; an import check can.
    const root = path.resolve(__dirname, "../..");
    const suspects: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
          if (/from\s+["']@\/lib\/experiments/.test(readFileSync(full, "utf8"))) suspects.push(full);
        }
      }
    };
    walk(path.join(root, "lib", "creativeIntelligence"));
    expect(suspects).toEqual([]);
    expect(readFileSync(path.join(root, "lib", "growthScore.ts"), "utf8")).not.toMatch(/lib\/experiments/);
  });
});

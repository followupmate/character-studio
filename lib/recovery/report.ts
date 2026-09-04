// RECOVERY phase 6 — the report and the pre-registered decision rule.
//
// The rule lives in recovery.json and was committed before the first recovery reel was published.
// This file evaluates it mechanically. That is the entire point: after five reels there will be a
// number, and a number always looks like it means something. The rule decides what happens next,
// not the feeling the number produces.
//
// Pure — no Supabase, no fetch. The route (app/api/recovery/report/route.ts) does the fetching.

import { formatWatchSummary } from "@/lib/creativeIntelligence/watchMetrics";

export interface RecoveryConfigReel {
  slot: number;
  direction: string;
  note: string | null;
  platform_post_id: string | null;
  posted_at: string | null;
}

export interface RecoveryConfig {
  baseline: { window: string; avg_watch_time_sec: number; views_24h: number };
  decision_rule: {
    primary_kpi: { metric: string; threshold_sec: number; horizon: string; fallback_horizon: string };
    secondary_kpi: string[];
    /** Every one of these must be present before a reel counts as measured (set 2026-09-04). */
    required_report_metrics?: string[];
    branches: Array<{ reels_at_or_above_threshold: string; verdict: string; action: string }>;
  };
  reels: RecoveryConfigReel[];
}

export interface SnapshotRow {
  horizon: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  total_interactions: number | null;
  avg_watch_time_sec: number | null;
  follows: number | null;
  profile_visits: number | null;
}

/**
 * Watch-retention block, read from chs_posts.engagement (jsonb) rather than from the snapshot
 * table — chs_post_performance_snapshots has no columns for these and adding them is DDL, which
 * this sprint does not do. See docs/MIGRATION-PROPOSAL-watch-retention.md for the migration that
 * would move them into the snapshot horizons properly.
 */
export interface WatchRetention {
  avg_watch_time_sec: number | null;
  video_view_total_time_sec: number | null;
  actual_video_duration_sec: number | null;
  avg_watch_ratio: number | null;
  avg_watch_ratio_exceeds_one: boolean;
}

/** The mandatory metric panel. A verdict read without these is not a verdict. */
export interface RequiredMetricPanel {
  values: Record<string, number | null>;
  missing: string[];
  complete: boolean;
}

export interface ReelReport {
  slot: number;
  direction: string;
  platformPostId: string | null;
  postedAt: string | null;
  status: "not_published" | "awaiting_data" | "measured";
  snapshots: { "24h": SnapshotRow | null; "72h": SnapshotRow | null; "7d": SnapshotRow | null };
  /** Collect-and-display only — never part of the threshold test or any scoring. */
  watch: WatchRetention;
  /** The metrics recovery.json requires alongside the verdict, and which of them are missing. */
  required: RequiredMetricPanel;
  /** The watch time the KPI is judged on, and which horizon it came from. */
  kpiWatchTimeSec: number | null;
  kpiHorizonUsed: "7d" | "72h" | null;
  meetsThreshold: boolean | null;
  /** How the KPI compares to the 20.8.–1.9. baseline. */
  vsBaseline: { watchTimeDeltaSec: number | null; views24hDelta: number | null };
}

export interface RecoveryReport {
  baseline: RecoveryConfig["baseline"];
  threshold: { metric: string; thresholdSec: number; horizon: string; fallbackHorizon: string };
  reels: ReelReport[];
  published: number;
  measured: number;
  atOrAboveThreshold: number;
  /** null until all five reels have a usable measurement — the rule is a five-reel rule. */
  decision: {
    branch: string;
    verdict: string;
    action: string;
    /** Printed with every verdict — the branch is an action, not the whole finding. */
    supporting: {
      medianWatchRatio: number | null;
      medianDurationSec: number | null;
      totalReach: number | null;
      totalSaves: number | null;
      totalShares: number | null;
    };
  } | null;
  decisionPending: string | null;
  /** Which metrics recovery.json requires next to the verdict. */
  requiredMetrics: string[];
}

const HORIZONS = ["24h", "72h", "7d"] as const;

// Fallback for a config written before required_report_metrics existed.
const DEFAULT_REQUIRED_METRICS = [
  "avg_watch_time_sec",
  "actual_video_duration_sec",
  "avg_watch_ratio",
  "reach",
  "saves",
  "shares",
];

/**
 * Assembles the mandatory panel from the KPI-horizon snapshot plus the retention block.
 *
 * The rule the operator set on 2026-09-04: the recovery verdict may not rest on avg_watch_time
 * alone. So "measured" now means every required metric is actually present — not that one number
 * happened to arrive. A reel with a watch time and nothing else is `awaiting_data`, which keeps the
 * five-reel decision from being read off a single column.
 */
export function buildRequiredPanel(
  config: RecoveryConfig,
  snapshot: SnapshotRow | null,
  watch: WatchRetention
): RequiredMetricPanel {
  const required = config.decision_rule.required_report_metrics ?? DEFAULT_REQUIRED_METRICS;
  const source: Record<string, number | null> = {
    avg_watch_time_sec: watch.avg_watch_time_sec ?? (snapshot?.avg_watch_time_sec ?? null),
    actual_video_duration_sec: watch.actual_video_duration_sec,
    avg_watch_ratio: watch.avg_watch_ratio,
    video_view_total_time_sec: watch.video_view_total_time_sec,
    reach: snapshot?.reach ?? null,
    saves: snapshot?.saves ?? null,
    shares: snapshot?.shares ?? null,
    views: snapshot?.views ?? null,
    total_interactions: snapshot?.total_interactions ?? null,
  };
  const values: Record<string, number | null> = {};
  const missing: string[] = [];
  for (const key of required) {
    const v = key in source ? source[key] : null;
    values[key] = v;
    // 0 is a measurement. null/undefined is not.
    if (v === null || v === undefined) missing.push(key);
  }
  return { values, missing, complete: missing.length === 0 };
}

function pickHorizon(rows: SnapshotRow[], horizon: string): SnapshotRow | null {
  return rows.find((r) => r.horizon === horizon) ?? null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function readWatchRetention(engagement: Record<string, unknown> | null | undefined): WatchRetention {
  const e = engagement ?? {};
  return {
    avg_watch_time_sec: num(e.avg_watch_time_sec),
    video_view_total_time_sec: num(e.video_view_total_time_sec),
    actual_video_duration_sec: num(e.actual_video_duration_sec),
    avg_watch_ratio: num(e.avg_watch_ratio),
    avg_watch_ratio_exceeds_one: e.avg_watch_ratio_exceeds_one === true,
  };
}

export function buildReelReport(
  reel: RecoveryConfigReel,
  rows: SnapshotRow[],
  config: RecoveryConfig,
  engagement?: Record<string, unknown> | null
): ReelReport {
  const snapshots = {
    "24h": pickHorizon(rows, "24h"),
    "72h": pickHorizon(rows, "72h"),
    "7d": pickHorizon(rows, "7d"),
  };

  const { horizon, fallback_horizon, threshold_sec } = config.decision_rule.primary_kpi;

  // 7d is the horizon the rule names; 72h is the explicit fallback for a reel that has not matured
  // yet. Anything else stays null rather than being quietly substituted — a 24h number is not a 7d
  // number and must never be scored as one.
  let kpiWatchTimeSec: number | null = null;
  let kpiHorizonUsed: "7d" | "72h" | null = null;
  const primary = snapshots[horizon as "7d"] ?? null;
  const fallback = snapshots[fallback_horizon as "72h"] ?? null;
  if (primary?.avg_watch_time_sec != null) {
    kpiWatchTimeSec = Number(primary.avg_watch_time_sec);
    kpiHorizonUsed = horizon as "7d";
  } else if (fallback?.avg_watch_time_sec != null) {
    kpiWatchTimeSec = Number(fallback.avg_watch_time_sec);
    kpiHorizonUsed = fallback_horizon as "72h";
  }

  // `status` is finalised after the required panel is built, below — a reel is only "measured"
  // when the whole mandatory panel is there, not when one number arrives.

  const views24h = snapshots["24h"]?.views;
  const watch = readWatchRetention(engagement);
  // The panel is read off the SAME horizon the KPI came from, so the numbers next to the verdict
  // describe the same moment as the verdict.
  const kpiSnapshot = kpiHorizonUsed ? snapshots[kpiHorizonUsed] : (snapshots["7d"] ?? snapshots["72h"]);
  const required = buildRequiredPanel(config, kpiSnapshot, watch);

  const status: ReelReport["status"] = !reel.platform_post_id
    ? "not_published"
    : kpiWatchTimeSec === null || !required.complete
      ? "awaiting_data"
      : "measured";

  return {
    slot: reel.slot,
    direction: reel.direction,
    platformPostId: reel.platform_post_id,
    postedAt: reel.posted_at,
    status,
    snapshots,
    watch,
    required,
    kpiWatchTimeSec,
    kpiHorizonUsed,
    meetsThreshold: kpiWatchTimeSec === null ? null : kpiWatchTimeSec >= threshold_sec,
    vsBaseline: {
      watchTimeDeltaSec:
        kpiWatchTimeSec === null
          ? null
          : Math.round((kpiWatchTimeSec - config.baseline.avg_watch_time_sec) * 100) / 100,
      views24hDelta: views24h == null ? null : Number(views24h) - config.baseline.views_24h,
    },
  };
}

// Branch keys in recovery.json are ">=2", "1", "0" — matched exactly, never re-derived, so the
// rule that runs is the rule that was committed.
export function selectBranch(config: RecoveryConfig, atOrAboveThreshold: number) {
  const branches = config.decision_rule.branches;
  if (atOrAboveThreshold >= 2) return branches.find((b) => b.reels_at_or_above_threshold === ">=2") ?? null;
  if (atOrAboveThreshold === 1) return branches.find((b) => b.reels_at_or_above_threshold === "1") ?? null;
  return branches.find((b) => b.reels_at_or_above_threshold === "0") ?? null;
}

export function buildRecoveryReport(
  config: RecoveryConfig,
  snapshotsByPostId: Map<string, SnapshotRow[]>,
  engagementByPostId?: Map<string, Record<string, unknown>>
): RecoveryReport {
  const reels = config.reels.map((reel) =>
    buildReelReport(
      reel,
      reel.platform_post_id ? (snapshotsByPostId.get(reel.platform_post_id) ?? []) : [],
      config,
      reel.platform_post_id ? engagementByPostId?.get(reel.platform_post_id) : null
    )
  );

  const median = (xs: number[]): number | null => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 1000) / 1000;
  };
  const sum = (key: "reach" | "saves" | "shares"): number | null => {
    const vals = reels.map((r) => r.required.values[key]).filter((v): v is number => typeof v === "number");
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
  };

  const published = reels.filter((r) => r.status !== "not_published").length;
  const measured = reels.filter((r) => r.status === "measured").length;
  const atOrAboveThreshold = reels.filter((r) => r.meetsThreshold === true).length;

  // The rule is a five-reel rule. Reading it early is how a sprint gets called on two data points,
  // which is exactly the habit that produced the closed loop in the first place.
  let decision: RecoveryReport["decision"] = null;
  let decisionPending: string | null = null;
  if (measured < config.reels.length) {
    const incomplete = reels
      .filter((r) => r.status === "awaiting_data" && r.required.missing.length > 0)
      .map((r) => `#${r.slot} missing ${r.required.missing.join(", ")}`);
    decisionPending =
      `${measured}/${config.reels.length} reels measured — the decision rule is a five-reel rule and is not evaluated ` +
      `until all five have a ${config.decision_rule.primary_kpi.horizon} (or ${config.decision_rule.primary_kpi.fallback_horizon}) ` +
      `watch time AND the full required metric panel.` +
      (incomplete.length > 0 ? ` Incomplete: ${incomplete.join("; ")}.` : "");
  } else {
    const branch = selectBranch(config, atOrAboveThreshold);
    if (branch) {
      decision = {
        branch: branch.reels_at_or_above_threshold,
        verdict: branch.verdict,
        action: branch.action,
        supporting: {
          medianWatchRatio: median(
            reels.map((r) => r.watch.avg_watch_ratio).filter((v): v is number => typeof v === "number")
          ),
          medianDurationSec: median(
            reels.map((r) => r.watch.actual_video_duration_sec).filter((v): v is number => typeof v === "number")
          ),
          totalReach: sum("reach"),
          totalSaves: sum("saves"),
          totalShares: sum("shares"),
        },
      };
    }
  }

  return {
    baseline: config.baseline,
    threshold: {
      metric: config.decision_rule.primary_kpi.metric,
      thresholdSec: config.decision_rule.primary_kpi.threshold_sec,
      horizon: config.decision_rule.primary_kpi.horizon,
      fallbackHorizon: config.decision_rule.primary_kpi.fallback_horizon,
    },
    reels,
    published,
    measured,
    atOrAboveThreshold,
    decision,
    decisionPending,
    requiredMetrics: config.decision_rule.required_report_metrics ?? DEFAULT_REQUIRED_METRICS,
  };
}

/** Plain-text rendering for a terminal / standup read. */
export function renderRecoveryReport(report: RecoveryReport): string {
  const lines: string[] = [];
  lines.push("RECOVERY REPORT");
  lines.push(
    `baseline (${report.baseline.window}): watch ${report.baseline.avg_watch_time_sec}s · 24h views ${report.baseline.views_24h}`
  );
  lines.push(
    `KPI: ${report.threshold.metric} >= ${report.threshold.thresholdSec}s @ ${report.threshold.horizon} (fallback ${report.threshold.fallbackHorizon})`
  );
  lines.push(`required alongside the verdict: ${report.requiredMetrics.join(", ")}`);
  lines.push("");

  for (const r of report.reels) {
    lines.push(`#${r.slot} ${r.direction}`);
    if (r.status === "not_published") {
      lines.push("   not published yet — add platform_post_id to recovery.json");
      lines.push("");
      continue;
    }
    for (const h of HORIZONS) {
      const s = r.snapshots[h];
      if (!s) {
        lines.push(`   ${h.padEnd(4)} —`);
        continue;
      }
      lines.push(
        `   ${h.padEnd(4)} views ${s.views ?? "—"} · reach ${s.reach ?? "—"} · watch ${s.avg_watch_time_sec ?? "—"}s · ` +
          `int ${s.total_interactions ?? "—"} · saves ${s.saves ?? "—"} · shares ${s.shares ?? "—"} · ` +
          `follows ${s.follows ?? "—"} · visits ${s.profile_visits ?? "—"}`
      );
    }
    lines.push(`   retention  ${formatWatchSummary(r.watch)}${r.watch.avg_watch_ratio_exceeds_one ? "  [ratio > 1 — replays, not an error]" : ""}`);
    lines.push(
      "   required   " +
        report.requiredMetrics
          .map((k) => `${k}=${r.required.values[k] === null || r.required.values[k] === undefined ? "—" : r.required.values[k]}`)
          .join(" · ")
    );
    if (r.required.missing.length > 0) lines.push(`   MISSING    ${r.required.missing.join(", ")}`);
    if (r.kpiWatchTimeSec === null) {
      lines.push("   KPI: awaiting data");
    } else {
      const delta = r.vsBaseline.watchTimeDeltaSec;
      lines.push(
        `   KPI: ${r.kpiWatchTimeSec}s @${r.kpiHorizonUsed} ` +
          `(${delta !== null && delta >= 0 ? "+" : ""}${delta}s vs baseline) → ${r.meetsThreshold ? "PASS" : "below threshold"}`
      );
    }
    lines.push("");
  }

  lines.push(`published ${report.published}/5 · measured ${report.measured}/5 · at or above threshold ${report.atOrAboveThreshold}/5`);
  if (report.decision) {
    const sup = report.decision.supporting;
    lines.push(`DECISION (${report.decision.branch}): ${report.decision.verdict}`);
    lines.push(`  -> ${report.decision.action}`);
    // The branch is the pre-registered ACTION. These are what it must be read against — a verdict
    // off avg_watch_time alone cannot tell a reel that did not hold from one that was just short.
    lines.push(
      `  read with: median ratio ${sup.medianWatchRatio ?? "—"} · median duration ${sup.medianDurationSec ?? "—"}s · ` +
        `reach ${sup.totalReach ?? "—"} · saves ${sup.totalSaves ?? "—"} · shares ${sup.totalShares ?? "—"}`
    );
  } else {
    lines.push(`DECISION: pending — ${report.decisionPending}`);
  }
  return lines.join("\n");
}

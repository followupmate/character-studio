import { deriveWatchMetrics } from "@/lib/creativeIntelligence/watchMetrics";
import type { HookType, MotifFamily, ExperimentRole } from "./visualHookPlan";

// VHD v1 — the evaluation panel.
//
// EXPERIMENT EVALUATION ONLY. Nothing in this module reaches lib/growthScore.ts,
// lib/creativeIntelligence/scoring.ts or any selection path, and visualHookEval.test.ts asserts
// that no file under lib/creativeIntelligence or lib/growthScore.ts imports it. CI_SCORING_FROZEN
// stays true; these thresholds are a reading aid for a human, not a ranking signal.
//
// TWO RULES THAT SHAPE EVERYTHING HERE:
//
// 1. A MISSING METRIC IS NOT ZERO. Instagram simply does not return some fields for some media at
//    some ages, and a null rendered as 0 turns "we have not measured this" into "this performed
//    at zero" — which is the more damaging of the two, because it looks like a finding.
//
// 2. HORIZONS ARE NEVER MIXED. A 24h reach next to a 72h watch time is not a row about a reel, it
//    is a row about two different moments. Each panel is built from ONE horizon's snapshot and
//    carries its horizon with it. The single exception is actual_video_duration_sec, which is a
//    property of the file rather than of a moment, and is therefore the same at every horizon;
//    that is why the ratio can be re-derived per horizon instead of borrowed from the lifetime
//    figure in chs_posts.engagement.

export const VHD_HORIZONS = ["24h", "72h"] as const;
export type VhdHorizon = (typeof VHD_HORIZONS)[number];

/** The panel, in the order it is read. */
export const VHD_METRICS = [
  "reach",
  "views",
  "avg_watch_time_sec",
  "actual_video_duration_sec",
  "avg_watch_ratio",
  "total_interactions",
  "saves",
  "shares",
] as const;
export type VhdMetric = (typeof VHD_METRICS)[number];

/** Recovery Phase 1 landed 0.70–0.87. Anything under this is a regression in the layer that was
 *  already fixed, and makes a distribution result unreadable — you cannot credit a motif with
 *  reach it bought by breaking retention. */
export const VHD_RETENTION_FLOOR = 0.65;

export type DistributionBand = "weak" | "improving" | "meaningful" | "strong";

/**
 * Diagnostic bands on 24h REACH, and only on 24h reach.
 *
 * 72h reach is not banded: the bands were calibrated against 24h figures, and re-using them a day
 * later would silently promote every arm by one grade.
 */
export const VHD_REACH_BANDS: Array<{ band: DistributionBand; min: number; max: number | null }> = [
  { band: "weak", min: 0, max: 39 },
  { band: "improving", min: 40, max: 63 },
  { band: "meaningful", min: 64, max: 99 },
  { band: "strong", min: 100, max: null },
];

export function bandFor24hReach(reach: number | null | undefined): DistributionBand | null {
  if (reach === null || reach === undefined || !Number.isFinite(reach)) return null;
  const hit = VHD_REACH_BANDS.find((b) => reach >= b.min && (b.max === null || reach <= b.max));
  return hit?.band ?? null;
}

/** One horizon's snapshot row, as stored in chs_post_performance_snapshots. */
export interface VhdSnapshot {
  horizon: string;
  views: number | null;
  reach: number | null;
  saves: number | null;
  shares: number | null;
  total_interactions: number | null;
  avg_watch_time_sec: number | null;
}

export interface VhdMetricPanel {
  horizon: VhdHorizon;
  values: Record<VhdMetric, number | null>;
  missing: VhdMetric[];
  complete: boolean;
  /** Set when the ratio genuinely exceeds 1 — replays, not an error. Never clamped. */
  ratioExceedsOne: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Builds one horizon's panel.
 *
 * `actualDurationSec` comes from the published MP4's own header (lib/recovery/videoDuration.ts),
 * not from what the provider was asked for — a Kling clip asked for 8s comes back at 8.04s, and
 * the ratio has to be computed against what actually shipped.
 */
export function buildVhdPanel(
  horizon: VhdHorizon,
  snapshot: VhdSnapshot | null | undefined,
  actualDurationSec: number | null | undefined
): VhdMetricPanel {
  const watch = num(snapshot?.avg_watch_time_sec);
  const duration = num(actualDurationSec);

  // Derived from THIS horizon's watch time, never borrowed from the lifetime figure. Returns no
  // ratio at all when the duration is absent or non-positive, and never clamps one above 1.
  const derived = deriveWatchMetrics({
    ...(watch !== null ? { avgWatchTimeSec: watch } : {}),
    actualDurationSec: duration,
  });

  const values: Record<VhdMetric, number | null> = {
    reach: num(snapshot?.reach),
    views: num(snapshot?.views),
    avg_watch_time_sec: watch,
    actual_video_duration_sec: derived.actual_video_duration_sec ?? null,
    avg_watch_ratio: derived.avg_watch_ratio ?? null,
    total_interactions: num(snapshot?.total_interactions),
    saves: num(snapshot?.saves),
    shares: num(snapshot?.shares),
  };

  const missing = VHD_METRICS.filter((m) => values[m] === null);
  return {
    horizon,
    values,
    missing,
    complete: missing.length === 0,
    ratioExceedsOne: derived.avg_watch_ratio_exceeds_one === true,
  };
}

export interface VhdRetentionVerdict {
  horizonUsed: VhdHorizon | null;
  ratio: number | null;
  floor: number;
  passes: boolean | null;
}

/**
 * The retention floor, read at the most mature horizon that actually has a ratio.
 *
 * Prefers 72h and falls back to 24h; when neither has one the verdict is null, never false. "Not
 * measured" and "measured below the floor" are different findings and are kept apart all the way
 * to the render.
 */
export function evaluateRetentionFloor(panels: Record<VhdHorizon, VhdMetricPanel>): VhdRetentionVerdict {
  for (const h of ["72h", "24h"] as const) {
    const ratio = panels[h]?.values.avg_watch_ratio ?? null;
    if (ratio !== null) return { horizonUsed: h, ratio, floor: VHD_RETENTION_FLOOR, passes: ratio >= VHD_RETENTION_FLOOR };
  }
  return { horizonUsed: null, ratio: null, floor: VHD_RETENTION_FLOOR, passes: null };
}

export interface VhdReelInput {
  index: number;
  direction: string;
  motifFamily: MotifFamily;
  hookType: HookType;
  experimentRole: ExperimentRole;
  calendarDate: string | null;
  platformPostId: string | null;
  postedAt: string | null;
  snapshots: VhdSnapshot[];
  actualDurationSec: number | null;
}

export interface VhdReelReport {
  index: number;
  direction: string;
  motifFamily: MotifFamily;
  hookType: HookType;
  experimentRole: ExperimentRole;
  calendarDate: string | null;
  platformPostId: string | null;
  postedAt: string | null;
  status: "not_published" | "awaiting_data" | "measured";
  panels: Record<VhdHorizon, VhdMetricPanel>;
  retention: VhdRetentionVerdict;
  distribution: { reach24h: number | null; band: DistributionBand | null };
}

export function buildVhdReelReport(input: VhdReelInput): VhdReelReport {
  const byHorizon = (h: VhdHorizon) => input.snapshots.find((s) => s.horizon === h) ?? null;
  const panels = {
    "24h": buildVhdPanel("24h", byHorizon("24h"), input.actualDurationSec),
    "72h": buildVhdPanel("72h", byHorizon("72h"), input.actualDurationSec),
  } as Record<VhdHorizon, VhdMetricPanel>;

  const retention = evaluateRetentionFloor(panels);
  const reach24h = panels["24h"].values.reach;

  // "measured" means the 24h panel is whole. 24h is the horizon the distribution band is defined
  // on, so an arm without a complete 24h panel has not yet produced the number the experiment is
  // actually asking about, whatever else has arrived.
  const status: VhdReelReport["status"] = !input.platformPostId
    ? "not_published"
    : panels["24h"].complete
      ? "measured"
      : "awaiting_data";

  return {
    index: input.index,
    direction: input.direction,
    motifFamily: input.motifFamily,
    hookType: input.hookType,
    experimentRole: input.experimentRole,
    calendarDate: input.calendarDate,
    platformPostId: input.platformPostId,
    postedAt: input.postedAt,
    status,
    panels,
    retention,
    distribution: { reach24h, band: bandFor24hReach(reach24h) },
  };
}

export interface VhdReport {
  version: string;
  retentionFloor: number;
  reachBands: typeof VHD_REACH_BANDS;
  reels: VhdReelReport[];
  published: number;
  measured: number;
  /** null until every arm has a complete 24h panel — a five-arm comparison read at three arms is
   *  how a sprint gets called on noise. */
  comparison: {
    control: { index: number; reach24h: number | null; band: DistributionBand | null; ratio: number | null } | null;
    challengers: Array<{
      index: number;
      motifFamily: MotifFamily;
      hookType: HookType;
      reach24h: number | null;
      band: DistributionBand | null;
      ratio: number | null;
      /** reach24h minus the control's, or null when either side is missing. */
      reachDeltaVsControl: number | null;
      /** An arm that broke retention cannot be credited with the reach it bought. */
      retentionHeld: boolean | null;
    }>;
  } | null;
  pending: string | null;
  notForScoring: true;
}

export function buildVhdReport(reels: VhdReelReport[], version: string): VhdReport {
  const published = reels.filter((r) => r.status !== "not_published").length;
  const measured = reels.filter((r) => r.status === "measured").length;

  let comparison: VhdReport["comparison"] = null;
  let pending: string | null = null;

  if (measured < reels.length) {
    const incomplete = reels
      .filter((r) => r.status !== "measured")
      .map((r) =>
        r.status === "not_published"
          ? `#${r.index} not published`
          : `#${r.index} missing ${r.panels["24h"].missing.join(", ")} at 24h`
      );
    pending =
      `${measured}/${reels.length} arms measured — the comparison needs a complete 24h panel on every arm, ` +
      `including the control. Incomplete: ${incomplete.join("; ")}.`;
  } else {
    const controlReel = reels.find((r) => r.experimentRole === "control") ?? null;
    const controlReach = controlReel?.distribution.reach24h ?? null;
    comparison = {
      control: controlReel
        ? {
            index: controlReel.index,
            reach24h: controlReel.distribution.reach24h,
            band: controlReel.distribution.band,
            ratio: controlReel.retention.ratio,
          }
        : null,
      challengers: reels
        .filter((r) => r.experimentRole === "challenger")
        .map((r) => ({
          index: r.index,
          motifFamily: r.motifFamily,
          hookType: r.hookType,
          reach24h: r.distribution.reach24h,
          band: r.distribution.band,
          ratio: r.retention.ratio,
          reachDeltaVsControl:
            r.distribution.reach24h === null || controlReach === null ? null : r.distribution.reach24h - controlReach,
          retentionHeld: r.retention.passes,
        })),
    };
  }

  return {
    version,
    retentionFloor: VHD_RETENTION_FLOOR,
    reachBands: VHD_REACH_BANDS,
    reels,
    published,
    measured,
    comparison,
    pending,
    notForScoring: true,
  };
}

/* ── Plain-text rendering ────────────────────────────────────────────────── */

const show = (v: number | null, digits = 0): string => (v === null ? "—" : v.toFixed(digits));

export function renderVhdReport(report: VhdReport): string {
  const lines: string[] = [];
  lines.push(`VISUAL / HOOK / DISTRIBUTION EXPERIMENT — ${report.version}`);
  lines.push(`retention floor: avg_watch_ratio >= ${report.retentionFloor}`);
  lines.push(
    "24h reach bands: " + report.reachBands.map((b) => `${b.band} ${b.min}${b.max === null ? "+" : `–${b.max}`}`).join(" · ")
  );
  lines.push("experiment evaluation only — not an input to CI scoring, which stays frozen");
  lines.push("");

  for (const r of report.reels) {
    lines.push(`#${r.index} ${r.direction}  [${r.experimentRole}] ${r.motifFamily} / ${r.hookType}${r.calendarDate ? `  ${r.calendarDate}` : ""}`);
    if (r.status === "not_published") {
      lines.push("   not published yet");
      lines.push("");
      continue;
    }
    for (const h of VHD_HORIZONS) {
      const p = r.panels[h];
      lines.push(
        `   ${h.padEnd(4)} reach ${show(p.values.reach)} · views ${show(p.values.views)} · ` +
          `watch ${show(p.values.avg_watch_time_sec, 2)}s / dur ${show(p.values.actual_video_duration_sec, 2)}s = ` +
          `ratio ${show(p.values.avg_watch_ratio, 3)} · int ${show(p.values.total_interactions)} · ` +
          `saves ${show(p.values.saves)} · shares ${show(p.values.shares)}` +
          (p.ratioExceedsOne ? "  [ratio > 1 — replays, not an error]" : "")
      );
      if (p.missing.length > 0) lines.push(`        missing at ${h}: ${p.missing.join(", ")}`);
    }
    lines.push(
      `   retention ${show(r.retention.ratio, 3)}${r.retention.horizonUsed ? ` @${r.retention.horizonUsed}` : ""} → ` +
        (r.retention.passes === null ? "not measured" : r.retention.passes ? "holds" : `BELOW ${r.retention.floor}`)
    );
    lines.push(`   distribution 24h reach ${show(r.distribution.reach24h)} → ${r.distribution.band ?? "not measured"}`);
    lines.push("");
  }

  lines.push(`published ${report.published}/${report.reels.length} · measured ${report.measured}/${report.reels.length}`);
  if (!report.comparison) {
    lines.push(`COMPARISON: pending — ${report.pending}`);
    return lines.join("\n");
  }

  const c = report.comparison.control;
  lines.push(
    `CONTROL #${c?.index ?? "—"}: 24h reach ${show(c?.reach24h ?? null)} (${c?.band ?? "—"}) · ratio ${show(c?.ratio ?? null, 3)}`
  );
  for (const ch of report.comparison.challengers) {
    const delta = ch.reachDeltaVsControl;
    lines.push(
      `  #${ch.index} ${ch.motifFamily}/${ch.hookType}: reach ${show(ch.reach24h)} (${ch.band ?? "—"}) ` +
        `${delta === null ? "" : `${delta >= 0 ? "+" : ""}${delta} vs control `}· ratio ${show(ch.ratio, 3)}` +
        (ch.retentionHeld === false ? "  ← RETENTION BROKE: its reach cannot be credited to the motif" : "")
    );
  }
  return lines.join("\n");
}

import { supabase } from "@/lib/supabase";
import { getStrategySnapshotById } from "./strategyGenerator";
import { describeShotStyle } from "./contentConcept";
import type { Horizon } from "./performanceSnapshots";
import type { NextContentRecommendation, StrategyCategory } from "./types";

// Closed-loop CI evaluation — the READ/EVALUATION layer only. Never writes to chs_story_days,
// never touches storyGeneration.ts/dailyBatch.ts/generationStrategyAdapter.ts's selection logic,
// never changes the 60/30/10 split or bias strength. It answers one question after the fact:
// "did the content CI nudged us toward actually work, and did we even follow the nudge?" —
// using ONLY chs_post_performance_snapshots (immutable checkpoints) and the already-saved
// chs_ci_strategy_snapshots recommendation the post's story_day was attributed to.

export type Verdict = "strong_win" | "win" | "neutral" | "loss" | "insufficient_data";
export type Bucket = "low" | "medium" | "high";

// SCORING-SAFE attributes only — every field here is either a controlled enum (tier) or a
// categorical family/tag value (moment_family, location_family, activity, sexual_energy_level,
// a humanized shot_archetype id), never raw free text written fresh by an LLM. This is
// deliberate: comparing two independently-written free-text sentences with exact string
// equality is not a meaningful "did it follow the recommendation" signal, so `location`/`mood`
// are excluded from this type entirely (see FreeTextAttributes below for their diagnostic-only
// counterparts) rather than naively string-matched.
export interface ContentAttributes {
  tier: string | null;
  moment_family: string | null;
  location_family: string | null;
  activity: string | null;
  sexual_energy_level: string | null;
  shot_style: string | null;
}

// Free text shown in the dashboard for human context — NEVER fed into computeAlignmentScore.
// `location` here is the location_family tag when we have one (for consistent display),
// otherwise the raw location sentence; `mood` is always raw text (no family/tag representation
// exists for it in production data today).
export interface FreeTextAttributes {
  location: string | null;
  mood: string | null;
}

export interface PlatformMetricsInput {
  reach?: number | null;
  views?: number | null;
  saves?: number | null;
  shares?: number | null;
  avg_watch_time_sec?: number | null;
}

export type PlatformUpliftMetric = "reach" | "views" | "saves" | "shares" | "watch_time";

export interface MetricUpliftEntry {
  metric: PlatformUpliftMetric;
  postValue: number | null;
  baselineValue: number | null;
  uplift: number | null; // fraction — 0.42 means +42%
  available: boolean;
}

export interface SnapshotMetricsPublic {
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  avg_watch_time_sec: number | null;
  fanvue_clicks: number | null;
}

export interface StrategyOutcome {
  postId: string;
  storyDayId: string;
  strategySnapshotId: string;
  recommendationRank: number;
  recommendationCategory: StrategyCategory;
  recommendationConfidence: number;

  horizon: Horizon;
  capturedAt: string;
  ageHours: number;

  alignmentScore: number | null;
  recommended: ContentAttributes;
  actual: ContentAttributes;
  recommendedText: FreeTextAttributes; // diagnostic-only — never part of alignmentScore
  actualText: FreeTextAttributes;

  platformUplift: number | null;
  platformUpliftDetail: MetricUpliftEntry[];
  businessUplift: number | null;

  rawMetrics: SnapshotMetricsPublic;
  baselineMetrics: SnapshotMetricsPublic;
  comparableSampleSize: number;
  baselineWindowDays: number;

  evidencePostIds: string[];
  verdict: Verdict;
}

export interface CategoryBucketStats {
  count: number;
  winRate: number | null;
  strongWinRate: number | null;
  avgPlatformUplift: number | null;
  medianPlatformUplift: number | null;
}

export interface StrategyEffectivenessSummary {
  characterId: string;
  horizon: Horizon;
  totalCiGuidedPosts: number;
  matureCounts: Record<Horizon, number>;
  winRate: number | null;
  strongWinRate: number | null;
  avgPlatformUplift: number | null;
  medianPlatformUplift: number | null;
  avgBusinessUplift: number | null;
  byCategory: Record<StrategyCategory, CategoryBucketStats>;
  byConfidenceBucket: Record<Bucket, CategoryBucketStats>;
  byAlignmentBucket: Record<Bucket, CategoryBucketStats>;
}

// ── Pure functions (unit tested directly, no Supabase) ─────────────────────────────────────

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Recent-window baseline selection: prefers the tightest (most recent) window that still clears
// minSample, widening 30 -> 60 -> 90 days only when the tighter window is too thin. If even 90
// days doesn't clear minSample, returns the 90-day sample anyway — deriveVerdict() is what turns
// a too-small comparableSampleSize into "insufficient_data", not this function.
const BASELINE_WINDOWS_DAYS = [30, 60, 90] as const;

export function pickBaselineWindow<T extends { postedAt: string }>(
  candidates: T[],
  now: Date,
  minSample: number
): { windowDays: number; sample: T[] } {
  let widest = { windowDays: BASELINE_WINDOWS_DAYS[BASELINE_WINDOWS_DAYS.length - 1], sample: candidates };
  for (const days of BASELINE_WINDOWS_DAYS) {
    const cutoff = now.getTime() - days * 86_400_000;
    const sample = candidates.filter((c) => new Date(c.postedAt).getTime() >= cutoff);
    widest = { windowDays: days, sample };
    if (sample.length >= minSample) return widest;
  }
  return widest;
}

// Recommendation alignment — did the generated post actually follow what was recommended?
// Every dimension is compared ONLY when both sides have a real value; a dimension missing on
// either side is skipped entirely (never counted as a mismatch), and the score renormalizes over
// however many dimensions were actually comparable. Zero comparable dimensions -> null, never 0
// (0 would falsely read as "actively contradicted the recommendation").
//
// Deliberately excludes `mood` (short free text, no family/tag representation exists anywhere in
// production data) and raw free-text `location` — see ContentAttributes' comment. `location`
// only enters this list via `location_family`, which is null whenever either side lacks a real
// tag, so a naive free-text match can never happen: the dimension is simply skipped for that
// post, same as any other missing dimension, per the "missing != mismatch" rule above. No new
// LLM call was added to make location/mood comparable — V1 honestly reports "not enough
// tagging" here rather than inventing a semantic-match heuristic.
const ALIGNMENT_DIMENSIONS: (keyof ContentAttributes)[] = ["tier", "moment_family", "location_family", "activity", "sexual_energy_level", "shot_style"];

function normalizeForCompare(s: string | null): string | null {
  return s ? s.trim().toLowerCase() : null;
}

export function computeAlignmentScore(recommended: ContentAttributes, actual: ContentAttributes): number | null {
  let comparable = 0;
  let matches = 0;
  for (const dim of ALIGNMENT_DIMENSIONS) {
    const r = normalizeForCompare(recommended[dim]);
    const a = normalizeForCompare(actual[dim]);
    if (r === null || a === null) continue;
    comparable++;
    if (r === a) matches++;
  }
  if (comparable === 0) return null;
  return Math.round((matches / comparable) * 100) / 100;
}

// Platform uplift — same philosophy as scoring.ts's buildPerformanceBreakdown: every metric is
// normalized against a baseline (here: this character's own recent same-post_type-and-horizon
// median, not a fixed target), weighted, and renormalized over whichever metrics are actually
// available on BOTH sides. A metric missing on either side is excluded from the weighted average
// entirely — never treated as 0 uplift and never treated as 0 baseline.
//
// Weights (documented, not a black box): reach/saves/shares mirror growthScore.ts's own
// prioritization (saves=4, shares=5 >> views=0.1 per-unit) — saves/shares are the strongest
// "this actually resonated" signals, reach is the broadest reduction of "did it get seen" but is
// noisier (easily inflated by one viral outlier), watch_time is reels-only retention signal,
// views is the weakest/vanity signal and gets the smallest weight.
export const PLATFORM_UPLIFT_WEIGHTS: Record<PlatformUpliftMetric, number> = {
  reach: 0.3,
  saves: 0.25,
  shares: 0.2,
  watch_time: 0.15,
  views: 0.1,
};

function metricInputValue(metric: PlatformUpliftMetric, m: PlatformMetricsInput): number | null | undefined {
  switch (metric) {
    case "reach":
      return m.reach;
    case "views":
      return m.views;
    case "saves":
      return m.saves;
    case "shares":
      return m.shares;
    case "watch_time":
      return m.avg_watch_time_sec;
  }
}

export function computePlatformUplift(
  post: PlatformMetricsInput,
  baselineMedian: PlatformMetricsInput
): { value: number | null; detail: MetricUpliftEntry[] } {
  const detail: MetricUpliftEntry[] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const metric of Object.keys(PLATFORM_UPLIFT_WEIGHTS) as PlatformUpliftMetric[]) {
    const postValue = metricInputValue(metric, post);
    const baselineValue = metricInputValue(metric, baselineMedian);
    const available =
      postValue !== null && postValue !== undefined && baselineValue !== null && baselineValue !== undefined && baselineValue > 0;
    const uplift = available ? (postValue as number) / (baselineValue as number) - 1 : null;
    detail.push({ metric, postValue: postValue ?? null, baselineValue: baselineValue ?? null, uplift, available });
    if (available) {
      weightedSum += PLATFORM_UPLIFT_WEIGHTS[metric] * (uplift as number);
      weightTotal += PLATFORM_UPLIFT_WEIGHTS[metric];
    }
  }
  const value = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 1000) / 1000 : null;
  return { value, detail };
}

// Business uplift — fanvue_clicks ONLY, kept fully separate from platform uplift (never blended
// in, same separation principle as scoring.ts's platform/business split). No Fanvue tracking on
// either side (post or baseline) -> null, never 0 — 0 would falsely claim "we know Fanvue
// clicks were absent" when we simply have no data.
export function computeBusinessUplift(postFanvueClicks: number | null | undefined, baselineFanvueClicksMedian: number | null | undefined): number | null {
  if (postFanvueClicks === null || postFanvueClicks === undefined) return null;
  if (baselineFanvueClicksMedian === null || baselineFanvueClicksMedian === undefined || baselineFanvueClicksMedian <= 0) return null;
  return Math.round((postFanvueClicks / baselineFanvueClicksMedian - 1) * 1000) / 1000;
}

// ── Verdict thresholds (documented + tested) ────────────────────────────────────────────────
//
// Below MIN_COMPARABLE_SAMPLE real baseline posts, or with no computable platformUplift at all,
// the honest answer is "we don't know yet" — never "loss". A thin/absent baseline is a data
// problem, not a performance problem.
//
// Performance tier from platformUplift alone:
//   >= +50%           strong
//   +15% .. +50%       positive
//   -15% .. +15%       neutral
//   <= -15%            negative  -> always "loss" (poor performance is poor performance,
//                                    regardless of how closely the recommendation was followed —
//                                    alignment only ever LIMITS credit, never excuses a loss)
//
// Alignment then modulates strong/positive tiers ONLY (never downgrades neutral, never excuses
// negative): alignmentScore === null (nothing comparable) is treated as "no reason to doubt it",
// same as the rest of this module's missing-data philosophy.
//   strong tier + alignment >= ALIGNMENT_HIGH (or null) -> strong_win
//   strong tier + alignment >= ALIGNMENT_LOW             -> win        (good result, capped down —
//                                                                        recommendation only loosely followed)
//   strong tier + alignment <  ALIGNMENT_LOW             -> neutral    (can't credit CI at all)
//   positive tier + alignment >= ALIGNMENT_LOW (or null) -> win
//   positive tier + alignment <  ALIGNMENT_LOW           -> neutral
export const MIN_COMPARABLE_SAMPLE = 5;
export const STRONG_UPLIFT_THRESHOLD = 0.5;
export const POSITIVE_UPLIFT_THRESHOLD = 0.15;
export const NEGATIVE_UPLIFT_THRESHOLD = -0.15;
export const ALIGNMENT_HIGH_THRESHOLD = 0.6;
export const ALIGNMENT_LOW_THRESHOLD = 0.3;

export function deriveVerdict(platformUplift: number | null, alignmentScore: number | null, comparableSampleSize: number): Verdict {
  if (comparableSampleSize < MIN_COMPARABLE_SAMPLE) return "insufficient_data";
  if (platformUplift === null) return "insufficient_data";

  const tier: "strong" | "positive" | "neutral" | "negative" =
    platformUplift >= STRONG_UPLIFT_THRESHOLD
      ? "strong"
      : platformUplift >= POSITIVE_UPLIFT_THRESHOLD
        ? "positive"
        : platformUplift > NEGATIVE_UPLIFT_THRESHOLD
          ? "neutral"
          : "negative";

  if (tier === "negative") return "loss";
  if (tier === "neutral") return "neutral";

  const alignmentOk = alignmentScore === null || alignmentScore >= ALIGNMENT_LOW_THRESHOLD;
  const alignmentHigh = alignmentScore === null || alignmentScore >= ALIGNMENT_HIGH_THRESHOLD;

  if (tier === "strong") {
    if (alignmentHigh) return "strong_win";
    if (alignmentOk) return "win";
    return "neutral";
  }
  return alignmentOk ? "win" : "neutral"; // tier === "positive"
}

// Mirrors generationStrategyAdapter.ts's biasStrengthFor() thresholds (<0.3 / 0.3-0.6 / >0.6) —
// intentionally the SAME boundaries so "confidence bucket" means one consistent thing across the
// whole CI system, not a second, subtly-different scale.
export function confidenceBucket(confidence: number): Bucket {
  if (confidence < 0.3) return "low";
  if (confidence <= 0.6) return "medium";
  return "high";
}

export function alignmentBucket(alignment: number | null): Bucket | null {
  if (alignment === null) return null;
  if (alignment < ALIGNMENT_LOW_THRESHOLD) return "low";
  if (alignment < ALIGNMENT_HIGH_THRESHOLD) return "medium";
  return "high";
}

// ── DB-orchestrating layer (not unit tested directly — house convention; verified against real
// production data instead, see the pre-push report) ─────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  // Postgres `numeric` columns come back from supabase-js as strings (precision safety) — same
  // reason app/api/publish/import-insights/route.ts already does Number(growth_score) || 0
  // elsewhere in this codebase. null/undefined stay null (missing != 0).
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface StoryDayForOutcome {
  id: string;
  strategy_snapshot_id: string | null;
  recommendation_rank: number | null;
  recommendation_category: StrategyCategory | null;
  tier: string | null;
  moment_family: string | null;
  location: string | null;
  mood: string | null;
}

interface MediaForOutcome {
  shot_archetype: string | null;
  visual_signature: { situation_tags?: { activity_family?: string | null; location_family?: string | null; sexual_energy_level?: string | null } } | null;
}

interface CiGuidedPost {
  postId: string;
  characterId: string;
  postType: string;
  postedAt: string;
  storyDayId: string;
  storyDay: StoryDayForOutcome;
  media: MediaForOutcome | null;
}

async function fetchCiGuidedPosts(characterId: string): Promise<CiGuidedPost[]> {
  const { data: storyDays } = await supabase
    .from("chs_story_days")
    .select("id, strategy_snapshot_id, recommendation_rank, recommendation_category, tier, moment_family, location, mood")
    .eq("character_id", characterId)
    .not("strategy_snapshot_id", "is", null);
  if (!storyDays || storyDays.length === 0) return [];
  const storyDayMap = new Map((storyDays as StoryDayForOutcome[]).map((sd) => [sd.id, sd]));

  const { data: posts } = await supabase
    .from("chs_posts")
    .select("id, character_id, post_type, posted_at, story_day_id, media_id")
    .eq("character_id", characterId)
    .eq("status", "posted")
    .neq("post_type", "story") // stories expire in 24h and never get engagement fetched at all
    // (see import-insights/route.ts's own .neq("post_type","story")) — excluded here too so
    // totalCiGuidedPosts never counts content that can structurally never mature.
    .not("posted_at", "is", null)
    .in("story_day_id", storyDays.map((sd) => sd.id));
  if (!posts || posts.length === 0) return [];

  const mediaIds = posts.map((p) => p.media_id).filter((id): id is string => !!id);
  const mediaMap = new Map<string, MediaForOutcome>();
  if (mediaIds.length > 0) {
    const { data: mediaRows } = await supabase.from("chs_media").select("id, shot_archetype, visual_signature").in("id", mediaIds);
    for (const m of mediaRows ?? []) mediaMap.set(m.id as string, m as unknown as MediaForOutcome);
  }

  return posts.map((p) => ({
    postId: p.id as string,
    characterId: p.character_id as string,
    postType: p.post_type as string,
    postedAt: p.posted_at as string,
    storyDayId: p.story_day_id as string,
    storyDay: storyDayMap.get(p.story_day_id as string)!,
    media: p.media_id ? (mediaMap.get(p.media_id as string) ?? null) : null,
  }));
}

interface SnapshotRow {
  post_id: string;
  horizon: string;
  captured_at: string;
  age_hours: number;
  reach: unknown;
  views: unknown;
  saves: unknown;
  shares: unknown;
  avg_watch_time_sec: unknown;
  fanvue_clicks: unknown;
}

async function fetchSnapshotsByPost(postIds: string[]): Promise<Map<string, Map<Horizon, SnapshotRow>>> {
  const map = new Map<string, Map<Horizon, SnapshotRow>>();
  if (postIds.length === 0) return map;
  const { data, error } = await supabase
    .from("chs_post_performance_snapshots")
    .select("post_id, horizon, captured_at, age_hours, reach, views, saves, shares, avg_watch_time_sec, fanvue_clicks")
    .in("post_id", postIds)
    .in("horizon", ["24h", "72h", "7d"]);
  // A query failure here (e.g. RLS, connectivity) must never crash the dashboard — same
  // read-only-safety posture as the rest of this module — but it must not silently look
  // identical to "no snapshots exist yet" either, so it's logged.
  if (error) console.error("[outcomeEvaluator] fetchSnapshotsByPost failed:", error.message);
  for (const row of (data ?? []) as SnapshotRow[]) {
    if (!map.has(row.post_id)) map.set(row.post_id, new Map());
    map.get(row.post_id)!.set(row.horizon as Horizon, row);
  }
  return map;
}

function toPublicMetrics(row: SnapshotRow): SnapshotMetricsPublic {
  return {
    reach: numOrNull(row.reach),
    views: numOrNull(row.views),
    saves: numOrNull(row.saves),
    shares: numOrNull(row.shares),
    avg_watch_time_sec: numOrNull(row.avg_watch_time_sec),
    fanvue_clicks: numOrNull(row.fanvue_clicks),
  };
}

interface BaselineCandidateRow {
  reach: unknown;
  views: unknown;
  saves: unknown;
  shares: unknown;
  avg_watch_time_sec: unknown;
  fanvue_clicks: unknown;
  chs_posts: { posted_at: string } | { posted_at: string }[] | null;
}

// `horizon` here is always the `Horizon` type ("24h" | "72h" | "7d") — 'current_observation'
// rows can never reach this query or be used as a baseline, because nothing in this module ever
// has a `Horizon`-typed variable holding that value (it only exists as a literal inside
// performanceSnapshots.ts's captureCurrentObservation, a completely separate write path this
// evaluator never calls). Same guarantee applies to fetchSnapshotsByPost above, which also only
// ever queries `.in("horizon", ["24h", "72h", "7d"])`.
async function fetchBaselineCandidates(
  characterId: string,
  postType: string,
  horizon: Horizon,
  excludePostId: string
): Promise<Array<SnapshotMetricsPublic & { postedAt: string }>> {
  const { data, error } = await supabase
    .from("chs_post_performance_snapshots")
    .select("reach, views, saves, shares, avg_watch_time_sec, fanvue_clicks, chs_posts!inner(posted_at)")
    .eq("character_id", characterId)
    .eq("post_type", postType)
    .eq("horizon", horizon)
    .neq("post_id", excludePostId)
    .limit(500);
  if (error) console.error("[outcomeEvaluator] fetchBaselineCandidates failed:", error.message);

  return ((data ?? []) as unknown as BaselineCandidateRow[])
    .map((row) => {
      const postedAt = Array.isArray(row.chs_posts) ? row.chs_posts[0]?.posted_at : row.chs_posts?.posted_at;
      if (!postedAt) return null;
      return { postedAt, reach: numOrNull(row.reach), views: numOrNull(row.views), saves: numOrNull(row.saves), shares: numOrNull(row.shares), avg_watch_time_sec: numOrNull(row.avg_watch_time_sec), fanvue_clicks: numOrNull(row.fanvue_clicks) };
    })
    .filter((r): r is SnapshotMetricsPublic & { postedAt: string } => r !== null);
}

function computeBaselineMetrics(sample: SnapshotMetricsPublic[]): SnapshotMetricsPublic {
  const col = (pick: (s: SnapshotMetricsPublic) => number | null) => median(sample.map(pick).filter((v): v is number => v !== null));
  return {
    reach: col((s) => s.reach),
    views: col((s) => s.views),
    saves: col((s) => s.saves),
    shares: col((s) => s.shares),
    avg_watch_time_sec: col((s) => s.avg_watch_time_sec),
    fanvue_clicks: col((s) => s.fanvue_clicks),
  };
}

function recommendedAttributes(rec: NextContentRecommendation): ContentAttributes {
  return {
    tier: rec.recommended_framing.tier,
    moment_family: rec.recommended_framing.moment_family,
    location_family: rec.recommended_framing.location_family, // tag-only, no free-text fallback
    activity: rec.recommended_framing.activity,
    sexual_energy_level: rec.recommended_framing.sexual_energy_level,
    shot_style: rec.shot_style,
  };
}

function recommendedText(rec: NextContentRecommendation): FreeTextAttributes {
  return { location: rec.recommended_framing.location, mood: rec.recommended_framing.mood };
}

function actualAttributes(storyDay: StoryDayForOutcome, media: MediaForOutcome | null): ContentAttributes {
  const tags = media?.visual_signature?.situation_tags;
  return {
    tier: storyDay.tier,
    moment_family: storyDay.moment_family,
    location_family: tags?.location_family ?? null, // tag-only, no free-text fallback
    activity: tags?.activity_family ?? null,
    sexual_energy_level: tags?.sexual_energy_level ?? null,
    shot_style: describeShotStyle(media?.shot_archetype ?? null),
  };
}

function actualText(storyDay: StoryDayForOutcome, media: MediaForOutcome | null): FreeTextAttributes {
  const tags = media?.visual_signature?.situation_tags;
  return { location: tags?.location_family ?? storyDay.location, mood: storyDay.mood };
}

interface BaselineEntry {
  windowDays: number;
  sampleSize: number;
  metrics: SnapshotMetricsPublic;
}

async function buildOutcomesForPosts(characterId: string, posts: CiGuidedPost[], onlyHorizon?: Horizon): Promise<StrategyOutcome[]> {
  if (posts.length === 0) return [];
  const snapshotsByPost = await fetchSnapshotsByPost(posts.map((p) => p.postId));
  const now = new Date();
  const horizons: Horizon[] = onlyHorizon ? [onlyHorizon] : ["24h", "72h", "7d"];

  const snapshotSnapshotCache = new Map<string, Awaited<ReturnType<typeof getStrategySnapshotById>>>();
  const baselineCache = new Map<string, BaselineEntry>();
  const outcomes: StrategyOutcome[] = [];

  for (const post of posts) {
    const sd = post.storyDay;
    if (!sd?.strategy_snapshot_id || sd.recommendation_rank === null || !sd.recommendation_category) continue;

    let strategySnapshot = snapshotSnapshotCache.get(sd.strategy_snapshot_id);
    if (strategySnapshot === undefined) {
      strategySnapshot = await getStrategySnapshotById(sd.strategy_snapshot_id);
      snapshotSnapshotCache.set(sd.strategy_snapshot_id, strategySnapshot);
    }
    if (!strategySnapshot) continue;
    const rec = strategySnapshot.recommendations.find((r) => r.rank === sd.recommendation_rank);
    if (!rec) continue;

    const recommended = recommendedAttributes(rec);
    const actual = actualAttributes(sd, post.media);
    const recText = recommendedText(rec);
    const actText = actualText(sd, post.media);
    const alignmentScore = computeAlignmentScore(recommended, actual);
    const evidencePostIds = rec.performance?.post_ids ?? (rec.scene_evidence ? [rec.scene_evidence.post_id] : []);

    for (const horizon of horizons) {
      const snap = snapshotsByPost.get(post.postId)?.get(horizon);
      if (!snap) continue; // not matured yet — simply absent from results, not "insufficient_data"

      const cacheKey = `${post.postType}|${horizon}`;
      let baseline = baselineCache.get(cacheKey);
      if (!baseline) {
        const candidates = await fetchBaselineCandidates(characterId, post.postType, horizon, post.postId);
        const { windowDays, sample } = pickBaselineWindow(candidates, now, MIN_COMPARABLE_SAMPLE);
        baseline = { windowDays, sampleSize: sample.length, metrics: computeBaselineMetrics(sample) };
        baselineCache.set(cacheKey, baseline);
      }

      const rawMetrics = toPublicMetrics(snap);
      const { value: platformUplift, detail } = computePlatformUplift(rawMetrics, baseline.metrics);
      const businessUplift = computeBusinessUplift(rawMetrics.fanvue_clicks, baseline.metrics.fanvue_clicks);
      const verdict = deriveVerdict(platformUplift, alignmentScore, baseline.sampleSize);

      outcomes.push({
        postId: post.postId,
        storyDayId: post.storyDayId,
        strategySnapshotId: sd.strategy_snapshot_id,
        recommendationRank: sd.recommendation_rank,
        recommendationCategory: sd.recommendation_category,
        recommendationConfidence: rec.confidence_score,
        horizon,
        capturedAt: snap.captured_at,
        ageHours: numOrNull(snap.age_hours) ?? 0,
        alignmentScore,
        recommended,
        actual,
        recommendedText: recText,
        actualText: actText,
        platformUplift,
        platformUpliftDetail: detail,
        businessUplift,
        rawMetrics,
        baselineMetrics: baseline.metrics,
        comparableSampleSize: baseline.sampleSize,
        baselineWindowDays: baseline.windowDays,
        evidencePostIds,
        verdict,
      });
    }
  }
  return outcomes;
}

// Every real StrategyOutcome for this character's CI-guided posts, across matured horizons
// only. Read-only — never called from the generation path.
export async function evaluateStrategyOutcomes(characterId: string, onlyHorizon?: Horizon): Promise<StrategyOutcome[]> {
  const posts = await fetchCiGuidedPosts(characterId);
  return buildOutcomesForPosts(characterId, posts, onlyHorizon);
}

function bucketStats(outcomes: StrategyOutcome[]): CategoryBucketStats {
  const withVerdict = outcomes.filter((o) => o.verdict !== "insufficient_data");
  const wins = withVerdict.filter((o) => o.verdict === "win" || o.verdict === "strong_win").length;
  const strongWins = withVerdict.filter((o) => o.verdict === "strong_win").length;
  const uplifts = outcomes.map((o) => o.platformUplift).filter((v): v is number => v !== null);
  return {
    count: outcomes.length,
    winRate: withVerdict.length > 0 ? Math.round((wins / withVerdict.length) * 100) / 100 : null,
    strongWinRate: withVerdict.length > 0 ? Math.round((strongWins / withVerdict.length) * 100) / 100 : null,
    avgPlatformUplift: uplifts.length > 0 ? Math.round((uplifts.reduce((s, v) => s + v, 0) / uplifts.length) * 1000) / 1000 : null,
    medianPlatformUplift: median(uplifts),
  };
}

// Measurement only — see file header. This never feeds back into the 60/30/10 split, confidence
// thresholds, bias strength, or the recommendation generator; it is read by the dashboard alone.
export async function summarizeStrategyEffectiveness(characterId: string, primaryHorizon: Horizon = "72h"): Promise<StrategyEffectivenessSummary> {
  const posts = await fetchCiGuidedPosts(characterId);
  const allOutcomes = await buildOutcomesForPosts(characterId, posts);
  const primary = allOutcomes.filter((o) => o.horizon === primaryHorizon);

  const matureCounts: Record<Horizon, number> = {
    "24h": new Set(allOutcomes.filter((o) => o.horizon === "24h").map((o) => o.postId)).size,
    "72h": new Set(allOutcomes.filter((o) => o.horizon === "72h").map((o) => o.postId)).size,
    "7d": new Set(allOutcomes.filter((o) => o.horizon === "7d").map((o) => o.postId)).size,
  };

  const overall = bucketStats(primary);
  const businessUplifts = primary.map((o) => o.businessUplift).filter((v): v is number => v !== null);

  const byCategory = {
    proven: bucketStats(primary.filter((o) => o.recommendationCategory === "proven")),
    evolution: bucketStats(primary.filter((o) => o.recommendationCategory === "evolution")),
    experiment: bucketStats(primary.filter((o) => o.recommendationCategory === "experiment")),
  };

  const byConfidenceBucket = {
    low: bucketStats(primary.filter((o) => confidenceBucket(o.recommendationConfidence) === "low")),
    medium: bucketStats(primary.filter((o) => confidenceBucket(o.recommendationConfidence) === "medium")),
    high: bucketStats(primary.filter((o) => confidenceBucket(o.recommendationConfidence) === "high")),
  };

  const byAlignmentBucket = {
    low: bucketStats(primary.filter((o) => alignmentBucket(o.alignmentScore) === "low")),
    medium: bucketStats(primary.filter((o) => alignmentBucket(o.alignmentScore) === "medium")),
    high: bucketStats(primary.filter((o) => alignmentBucket(o.alignmentScore) === "high")),
  };

  return {
    characterId,
    horizon: primaryHorizon,
    totalCiGuidedPosts: posts.length,
    matureCounts,
    winRate: overall.winRate,
    strongWinRate: overall.strongWinRate,
    avgPlatformUplift: overall.avgPlatformUplift,
    medianPlatformUplift: overall.medianPlatformUplift,
    avgBusinessUplift: businessUplifts.length > 0 ? Math.round((businessUplifts.reduce((s, v) => s + v, 0) / businessUplifts.length) * 1000) / 1000 : null,
    byCategory,
    byConfidenceBucket,
    byAlignmentBucket,
  };
}

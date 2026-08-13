'use client';

import { useEffect, useState } from 'react';

// Mirrors lib/creativeIntelligence/types.ts. Kept as a local, structural subset (not imported
// directly) since this is a client component and the source types live in a server-only module
// graph (lib/supabase.ts pulls in server env vars) — field names must stay in sync by hand.

type MetricCategory = 'platform' | 'business';
type WinningAxis = 'platform' | 'business' | 'both' | 'neither';
type ExplainableMetric =
  | 'reach'
  | 'non_follower_reach'
  | 'follows'
  | 'profile_visits'
  | 'watch_completion'
  | 'saves'
  | 'shares'
  | 'engagement'
  | 'total_interactions'
  | 'fanvue_clicks';
type WindowOption = '7' | '30' | '90' | 'all';

interface MetricBreakdownEntry {
  metric: ExplainableMetric;
  category: MetricCategory;
  available: boolean;
  raw_value: number | null;
  baseline_value: number | null;
  index: number | null;
  unavailable_reason?: string;
}

interface PerformanceBreakdown {
  sample_size: number;
  comparable_sample_size: number;
  metrics: MetricBreakdownEntry[];
  platform_composite_index: number | null;
  business_conversion_index: number | null;
  winning_axis: WinningAxis;
  post_ids: string[];
}

interface TopPost {
  post_id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  post_type: string;
  posted_at: string | null;
  tier: string | null;
  location: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  performance: PerformanceBreakdown;
  why_interesting: string;
}

interface WhatIsWorkingInsight {
  pattern_id: string;
  label: string;
  detail: string;
  platform_index: number | null;
  business_index: number | null;
  confidence_score: number;
  sample_size: number;
  tagging_note?: string;
}

interface PerformanceIntelligence {
  character_id: string;
  window_days: number;
  posts_analyzed: number;
  avg_reach: number;
  median_reach: number;
  best_direction_label: string | null;
  top_tier: string | null;
  top_posts: TopPost[];
  what_is_working: WhatIsWorkingInsight[];
}

interface MotionRecommendation {
  motion_pattern_id: string;
  name: string;
  status: 'paired' | 'fallback_unproven';
  reason: string;
  confidence_score: number;
}

type EvidenceLevel = 'direct' | 'derived';

interface NextContentRecommendation {
  rank: number;
  category: 'proven' | 'evolution' | 'experiment';
  scene: string;
  why: string;
  objective: string;
  visual_direction: string;
  shot_style: string | null;
  motion: MotionRecommendation | null;
  source_evidence: string;
  confidence_score: number;
  evidence_level: EvidenceLevel;
  scene_evidence: { post_id: string; reach: number | null } | null;
  performance: PerformanceBreakdown | null;
  platform_composite_index: number | null;
  business_conversion_index: number | null;
  winning_axis: WinningAxis;
  recommended_framing: { tier: string | null; moment_family: string | null; location: string | null; mood: string | null };
}

interface NextContentStrategy {
  character_id: string;
  generated_at: string;
  window_days: number;
  recommendations: NextContentRecommendation[];
  breakdown: { proven: number; evolution: number; experiment: number };
  data_status: 'ok' | 'insufficient_history';
}

const CATEGORY_COLOR: Record<string, string> = {
  proven: 'bg-green-100 text-green-800',
  evolution: 'bg-blue-100 text-blue-800',
  experiment: 'bg-purple-100 text-purple-800',
};

const WINNING_AXIS_LABEL: Record<WinningAxis, string> = {
  platform: 'Wins on IG growth',
  business: 'Wins on Fanvue conversion',
  both: 'Wins on both IG growth and Fanvue conversion',
  neither: 'Not above baseline yet',
};

const WINNING_AXIS_COLOR: Record<WinningAxis, string> = {
  platform: 'bg-blue-100 text-blue-800',
  business: 'bg-pink-100 text-pink-800',
  both: 'bg-teal-100 text-teal-800',
  neither: 'bg-gray-100 text-gray-600',
};

const OBJECTIVE_LABEL: Record<string, string> = {
  reach: 'Reach',
  follower_acquisition: 'Follower growth',
  retention: 'Retention',
  engagement: 'Engagement',
  fanvue_conversion: 'Fanvue conversion',
};

const METRIC_LABELS: Record<ExplainableMetric, string> = {
  reach: 'Reach',
  non_follower_reach: 'Non-follower reach',
  follows: 'Follows',
  profile_visits: 'Profile visits',
  watch_completion: 'Watch time (avg, sec)',
  saves: 'Saves',
  shares: 'Shares',
  engagement: 'Engagement rate',
  total_interactions: 'Total interactions',
  fanvue_clicks: 'Fanvue clicks',
};

const WINDOW_LABEL: Record<WindowOption, string> = { '7': '7 days', '30': '30 days', '90': '90 days', all: 'All time' };

// ── Strategy Performance (closed-loop CI evaluation) — mirrors lib/creativeIntelligence/
// outcomeEvaluator.ts's public types, same hand-sync convention as the rest of this file.
type Horizon = '24h' | '72h' | '7d';
type Verdict = 'strong_win' | 'win' | 'neutral' | 'loss' | 'insufficient_data';
type Bucket = 'low' | 'medium' | 'high';
type StrategyCategoryType = 'proven' | 'evolution' | 'experiment';

// Scoring-safe attributes only (tag/enum values) — mirrors outcomeEvaluator.ts's
// ContentAttributes. `location`/`mood` are deliberately absent: they're free text with no
// reliable family/tag representation, so V1 never string-matches them for alignment scoring —
// see FreeTextAttributesDTO below for their diagnostic-only display counterparts.
interface ContentAttributesDTO {
  tier: string | null;
  moment_family: string | null;
  location_family: string | null;
  activity: string | null;
  sexual_energy_level: string | null;
  shot_style: string | null;
}

interface FreeTextAttributesDTO {
  location: string | null;
  mood: string | null;
}

interface MetricUpliftEntryDTO {
  metric: 'reach' | 'views' | 'saves' | 'shares' | 'watch_time';
  postValue: number | null;
  baselineValue: number | null;
  uplift: number | null;
  available: boolean;
}

interface SnapshotMetricsDTO {
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  avg_watch_time_sec: number | null;
  fanvue_clicks: number | null;
}

interface StrategyOutcomeDTO {
  postId: string;
  storyDayId: string;
  strategySnapshotId: string;
  recommendationRank: number;
  recommendationCategory: StrategyCategoryType;
  recommendationConfidence: number;
  horizon: Horizon;
  capturedAt: string;
  ageHours: number;
  alignmentScore: number | null;
  recommended: ContentAttributesDTO;
  actual: ContentAttributesDTO;
  recommendedText: FreeTextAttributesDTO;
  actualText: FreeTextAttributesDTO;
  platformUplift: number | null;
  platformUpliftDetail: MetricUpliftEntryDTO[];
  businessUplift: number | null;
  rawMetrics: SnapshotMetricsDTO;
  baselineMetrics: SnapshotMetricsDTO;
  comparableSampleSize: number;
  baselineWindowDays: number;
  evidencePostIds: string[];
  verdict: Verdict;
}

interface CategoryBucketStatsDTO {
  count: number;
  winRate: number | null;
  strongWinRate: number | null;
  avgPlatformUplift: number | null;
  medianPlatformUplift: number | null;
}

interface StrategyEffectivenessSummaryDTO {
  characterId: string;
  horizon: Horizon;
  totalCiGuidedPosts: number;
  matureCounts: Record<Horizon, number>;
  winRate: number | null;
  strongWinRate: number | null;
  avgPlatformUplift: number | null;
  medianPlatformUplift: number | null;
  avgBusinessUplift: number | null;
  byCategory: Record<StrategyCategoryType, CategoryBucketStatsDTO>;
  byConfidenceBucket: Record<Bucket, CategoryBucketStatsDTO>;
  byAlignmentBucket: Record<Bucket, CategoryBucketStatsDTO>;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  strong_win: 'Strong win',
  win: 'Win',
  neutral: 'Neutral',
  loss: 'Loss',
  insufficient_data: 'Not enough data yet',
};
const VERDICT_COLOR: Record<Verdict, string> = {
  strong_win: 'bg-green-100 text-green-800',
  win: 'bg-teal-100 text-teal-800',
  neutral: 'bg-gray-100 text-gray-600',
  loss: 'bg-red-100 text-red-700',
  insufficient_data: 'bg-gray-100 text-gray-400',
};
const STRATEGY_LABEL: Record<StrategyCategoryType, string> = { proven: 'Proven', evolution: 'Evolution', experiment: 'Experiment' };

// Snapshot JSON is persisted and can be older than the code reading it — every numeric/enum
// display sourced from strategy JSON goes through these helpers instead of a raw `.toFixed()`
// or direct Record lookup, so a schema drift never crashes the page (see the earlier runtime fix).
function formatIndex(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}x` : '—';
}
function formatDelta(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'not enough data yet';
  const pct = Math.round((value - 1) * 100);
  if (pct === 0) return 'right at your normal content';
  return pct > 0 ? `+${pct}% vs your normal content` : `${pct}% vs your normal content`;
}
function formatPercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}
function formatNumber(value: unknown, decimals = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '—';
}
function formatCompactCount(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}
function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
function safeWinningAxis(value: unknown): WinningAxis {
  return value === 'platform' || value === 'business' || value === 'both' || value === 'neither' ? value : 'neither';
}
function humanizeTier(tier: string | null): string {
  if (!tier) return '—';
  const s = tier.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CreativeIntelligenceDashboard() {
  const [intelligence, setIntelligence] = useState<PerformanceIntelligence | null>(null);
  const [strategy, setStrategy] = useState<NextContentStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowOption, setWindowOption] = useState<WindowOption>('30');

  // Strategy Performance — horizon-based, not window-based, so it loads once independently of
  // the 7/30/90/all toggle above (it answers "how did CI-guided posts do at a fixed age", not
  // "what happened in the last N days").
  const [outcomesSummary, setOutcomesSummary] = useState<StrategyEffectivenessSummaryDTO | null>(null);
  const [outcomes, setOutcomes] = useState<StrategyOutcomeDTO[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(true);
  const [outcomesError, setOutcomesError] = useState<string | null>(null);

  useEffect(() => {
    void load(windowOption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowOption]);

  useEffect(() => {
    void loadOutcomes();
  }, []);

  async function loadOutcomes() {
    setOutcomesLoading(true);
    setOutcomesError(null);
    try {
      const res = await fetch('/api/creative-intelligence/outcomes?horizon=72h');
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Failed to load strategy performance');
      setOutcomesSummary(data.summary);
      setOutcomes(data.outcomes);
    } catch (err) {
      setOutcomesError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setOutcomesLoading(false);
    }
  }

  async function load(win: WindowOption) {
    setLoading(true);
    setError(null);
    try {
      const [analyzeRes, strategyRes] = await Promise.all([
        fetch(`/api/creative-intelligence/analyze?window=${win}`),
        fetch(`/api/creative-intelligence/strategy?window=${win}`),
      ]);
      const analyzeData = await analyzeRes.json();
      const strategyData = await strategyRes.json();

      if (!analyzeData.success) throw new Error(analyzeData.error ?? 'Failed to load performance intelligence');
      if (!strategyData.success) throw new Error(strategyData.error ?? 'Failed to load strategy');

      setIntelligence(analyzeData.intelligence);
      setStrategy(strategyData.strategy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="space-y-8">
        {/* Header + window toggle */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-8 text-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Creative Intelligence</h1>
              <p className="text-purple-100">What&apos;s working on Instagram, why, and what to make next.</p>
            </div>
            <div className="flex gap-1 bg-white/10 rounded-lg p-1">
              {(['7', '30', '90', 'all'] as WindowOption[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindowOption(w)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                    windowOption === w ? 'bg-white text-purple-700' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  {WINDOW_LABEL[w]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && <div className="bg-white rounded-lg shadow p-6 text-gray-500">Loading real performance data…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error}</div>}

        {!loading && !error && intelligence && (
          <>
            <ExecutiveSummary intelligence={intelligence} strategy={strategy} />
            <TopPerformingContent posts={intelligence.top_posts} />
            <WhatIsWorking insights={intelligence.what_is_working} />
            {strategy && <WhatToMakeNext strategy={strategy} />}
            <StrategyPerformance summary={outcomesSummary} outcomes={outcomes} loading={outcomesLoading} error={outcomesError} />
          </>
        )}
      </div>
    </div>
  );
}

// A. Executive Summary — understandable with zero knowledge of composite_index/baseline/scoring.
function ExecutiveSummary({ intelligence, strategy }: { intelligence: PerformanceIntelligence; strategy: NextContentStrategy | null }) {
  const best = intelligence.top_posts[0];
  const summarySentence = buildExecutiveSentence(intelligence, strategy);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Executive Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <Stat label="Posts analyzed" value={intelligence.posts_analyzed.toString()} />
        <Stat label="Typical reach (median)" value={formatCompactCount(intelligence.median_reach)} />
        <Stat label="Average reach" value={formatCompactCount(intelligence.avg_reach)} />
        <Stat label="Best post" value={best ? formatCompactCount(best.performance.metrics.find((m) => m.metric === 'reach')?.raw_value) : '—'} />
        <Stat label="Best direction" value={intelligence.best_direction_label ?? '—'} />
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{summarySentence}</p>
      {intelligence.posts_analyzed === 0 && (
        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          No scored posts yet in this window. Metrics import daily — once posts have real engagement data, this fills in.
        </p>
      )}
    </div>
  );
}

function buildExecutiveSentence(intelligence: PerformanceIntelligence, strategy: NextContentStrategy | null): string {
  if (intelligence.posts_analyzed === 0) return 'Not enough scored posts yet to summarize performance for this window.';
  const parts: string[] = [];
  const top = intelligence.top_posts.slice(0, 2);
  if (top.length === 1) parts.push(`The strongest reach came from one post (${formatCompactCount(top[0].performance.metrics.find((m) => m.metric === 'reach')?.raw_value)} reach).`);
  else if (top.length >= 2) parts.push(`The strongest reach came from two posts (${top.map((p) => formatCompactCount(p.performance.metrics.find((m) => m.metric === 'reach')?.raw_value)).join(' and ')} reach).`);
  if (intelligence.best_direction_label) parts.push(`${intelligence.best_direction_label} is significantly outperforming this account's own baseline.`);
  if (strategy?.data_status === 'insufficient_history') parts.push('Not enough proven history yet to split next content into proven/evolution/experiment — every suggestion below is still exploratory.');
  else parts.push("Data doesn't yet show enough Fanvue conversion or watch-time history to draw firm conclusions there — see Advanced Analytics for what's tracked.");
  return parts.join(' ');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

// B. Top Performing Content — the concrete winners, cards not a table.
function TopPerformingContent({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) return null;
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Top Performing Content</h2>
      <div className="space-y-4">
        {posts.slice(0, 5).map((post, i) => (
          <TopPostCard key={post.post_id} post={post} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function metricValue(p: TopPost, metric: ExplainableMetric): { raw: number | null; available: boolean; reason?: string } {
  const m = p.performance.metrics.find((x) => x.metric === metric);
  return { raw: m?.raw_value ?? null, available: !!m?.available, reason: m?.unavailable_reason };
}

function TopPostCard({ post, rank }: { post: TopPost; rank: number }) {
  const reach = metricValue(post, 'reach');
  const saves = metricValue(post, 'saves');
  const shares = metricValue(post, 'shares');
  const watch = metricValue(post, 'watch_completion');
  const totalInteractions = metricValue(post, 'total_interactions');
  const follows = metricValue(post, 'follows');
  const profileVisits = metricValue(post, 'profile_visits');
  const fanvue = metricValue(post, 'fanvue_clicks');

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <div className="md:w-56 bg-black flex-shrink-0">
          {post.media_url ? (
            <video src={post.media_url} controls muted preload="metadata" poster={post.thumbnail_url ?? undefined} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center text-gray-500 text-xs">No preview available</div>
          )}
        </div>
        <div className="p-4 flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-purple-700">#{rank} {post.post_type === 'reel' ? 'Reel' : humanizeTier(post.post_type)}</span>
            <span className="text-xs text-gray-500">{formatDate(post.posted_at)}</span>
          </div>
          <div className="text-lg font-bold text-gray-800 mb-2">{formatCompactCount(reach.raw)} reach</div>
          <p className="text-sm text-gray-700 mb-3">{post.why_interesting}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs text-gray-600">
            <MetricCell label="Views" value={formatCompactCount(post.views)} />
            <MetricCell label="Likes" value={formatCompactCount(post.likes)} />
            <MetricCell label="Comments" value={formatCompactCount(post.comments)} />
            <MetricCell label="Saves" value={formatCompactCount(saves.raw)} />
            <MetricCell label="Shares" value={formatCompactCount(shares.raw)} />
            <MetricCell label="Interactions" value={formatCompactCount(totalInteractions.raw)} />
            <MetricCell label="Avg watch" value={watch.available ? `${formatNumber(watch.raw, 1)}s` : '—'} />
            <MetricCell label="Follows" value={follows.available ? formatCompactCount(follows.raw) : '—'} note={!follows.available ? follows.reason : undefined} />
            <MetricCell label="Profile visits" value={profileVisits.available ? formatCompactCount(profileVisits.raw) : '—'} note={!profileVisits.available ? profileVisits.reason : undefined} />
            <MetricCell
              label="Fanvue clicks"
              value={fanvue.available ? formatCompactCount(fanvue.raw) : '—'}
              note={!fanvue.available ? (fanvue.reason ?? 'Fanvue conversion data not tracked for this post.') : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className="font-semibold text-gray-800" title={note}>{value}</div>
    </div>
  );
}

// C. What Is Working — real tagging dimensions, honest fallback when undertagged.
function WhatIsWorking({ insights }: { insights: WhatIsWorkingInsight[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">What Is Working</h2>
      {insights.length === 0 ? (
        <p className="text-gray-500 text-sm">No pattern has cleared the proven bar yet (needs ≥3 real posts of the same combination, outperforming this account&apos;s own baseline).</p>
      ) : (
        <div className="space-y-4">
          {insights.map((insight) => (
            <div key={insight.pattern_id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="font-semibold text-gray-800">{insight.label}</div>
                <span className="text-xs text-gray-500" title="How much we trust this overall direction — based on sample size, not any single post.">{insight.sample_size} posts · {formatPercent(insight.confidence_score)} direction confidence</span>
              </div>
              <div className="text-sm text-purple-700 font-medium mb-1">
                {insight.platform_index !== null && insight.platform_index > 1 ? `IG performance: ${formatDelta(insight.platform_index)}` : null}
                {insight.platform_index !== null && insight.platform_index > 1 && insight.business_index !== null && insight.business_index > 1 ? ' · ' : null}
                {insight.business_index !== null && insight.business_index > 1 ? `Fanvue: ${formatDelta(insight.business_index)}` : null}
              </div>
              <p className="text-sm text-gray-600">{insight.detail}</p>
              {insight.tagging_note && <p className="text-xs text-amber-600 mt-2 italic">{insight.tagging_note}</p>}
              <details className="mt-2">
                <summary className="text-xs text-purple-600 cursor-pointer">Advanced detail</summary>
                <div className="text-xs text-gray-500 mt-1">
                  Platform index: {formatIndex(insight.platform_index)} · Business index: {formatIndex(insight.business_index)}
                </div>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// D. What To Make Next — the primary action section. 7 genuinely different scenes.
function WhatToMakeNext({ strategy }: { strategy: NextContentStrategy }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-2">What To Make Next</h2>
      {strategy.data_status === 'insufficient_history' ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          Not enough real performance history yet for a proven/evolution/experiment split — every recommendation below is exploratory until more posts have been scored.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <BreakdownStat label="Proven (60%)" value={strategy.breakdown.proven} color="text-green-600" />
          <BreakdownStat label="Evolution (30%)" value={strategy.breakdown.evolution} color="text-blue-600" />
          <BreakdownStat label="Experiment (10%)" value={strategy.breakdown.experiment} color="text-purple-600" />
        </div>
      )}

      <div className="space-y-4">
        {strategy.recommendations.map((rec) => (
          <RecommendationCard key={rec.rank} rec={rec} />
        ))}
      </div>
    </div>
  );
}

// Only shown when evidence_level === 'direct' AND performance exists — an evolution slot
// (performance: null) must never render an axis badge that reads as "measured and found
// wanting". It gets a distinct, non-judgemental "derived" badge instead.
function DirectionBadge({ rec }: { rec: NextContentRecommendation }) {
  if (rec.evidence_level === 'direct' && rec.performance) {
    const axis = safeWinningAxis(rec.winning_axis);
    return <span className={`text-xs font-semibold px-2 py-1 rounded ${WINNING_AXIS_COLOR[axis]}`}>{WINNING_AXIS_LABEL[axis]}</span>;
  }
  return <span className="text-xs font-semibold px-2 py-1 rounded bg-indigo-100 text-indigo-700">Derived from proven direction</span>;
}

function RecommendationCard({ rec }: { rec: NextContentRecommendation }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded ${CATEGORY_COLOR[rec.category] ?? 'bg-gray-100 text-gray-700'}`}>{rec.category.toUpperCase()}</span>
          <DirectionBadge rec={rec} />
        </div>
        <span className="text-xs text-gray-500" title="How much we trust this overall direction — based on sample size, not this specific scene.">
          Direction confidence {formatPercent(rec.confidence_score)}
        </span>
      </div>

      <div className="font-semibold text-gray-800 mb-1">{rec.scene}</div>
      {rec.scene_evidence && (
        <div className="text-xs text-teal-700 mb-2">
          Scene evidence: this exact post reached {formatCompactCount(rec.scene_evidence.reach)}.
        </div>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
        <div>
          <dt className="text-xs text-gray-400 uppercase tracking-wide">Why</dt>
          <dd className="text-gray-700">{rec.why}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400 uppercase tracking-wide">Objective</dt>
          <dd className="text-gray-700">{OBJECTIVE_LABEL[rec.objective] ?? rec.objective}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400 uppercase tracking-wide">Visual direction</dt>
          <dd className="text-gray-700">{rec.visual_direction}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-400 uppercase tracking-wide">Shot style</dt>
          <dd className="text-gray-700">{rec.shot_style ?? '—'} <span className="text-gray-400 text-xs">(content metadata, not a motion suggestion)</span></dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-gray-400 uppercase tracking-wide">Motion (Kling suggestion)</dt>
          <dd className="text-gray-700">
            {rec.motion ? rec.motion.name : '—'}
            {rec.motion?.status === 'fallback_unproven' && <span className="block text-amber-600 text-xs mt-0.5">{rec.motion.reason}</span>}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-gray-500 border-t pt-2">{rec.source_evidence}</p>

      <details className="mt-2">
        <summary className="text-xs text-purple-600 cursor-pointer">Advanced analytics</summary>
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          <div>Platform index: {formatIndex(rec.platform_composite_index)} · Business index: {formatIndex(rec.business_conversion_index)}</div>
          {rec.performance ? <MetricBreakdownTable breakdown={rec.performance} /> : <div className="italic">No individual measurement for this scene — see source_evidence above for the parent direction&apos;s own numbers.</div>}
        </div>
      </details>
    </div>
  );
}

function BreakdownStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-4 bg-gray-50 rounded-lg">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

// E. Advanced Analytics detail table — raw baseline, composite index, per-metric indices,
// sample size, comparable posts, platform/business split. Diagnostic, not primary UI.
function MetricSection({ title, metrics, compositeLabel, compositeIndex }: { title: string; metrics: MetricBreakdownEntry[]; compositeLabel: string; compositeIndex: number | null }) {
  return (
    <div className="mb-2">
      <div className="text-gray-400 uppercase tracking-wide text-[10px] mb-1">{title}</div>
      <table className="w-full">
        <thead>
          <tr className="text-gray-400 text-left">
            <th className="font-normal pb-1">Metric</th>
            <th className="font-normal pb-1">This</th>
            <th className="font-normal pb-1">Baseline</th>
            <th className="font-normal pb-1">Index</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.metric} className="border-t border-gray-100">
              <td className="py-1 text-gray-600">{METRIC_LABELS[m.metric]}</td>
              {m.available ? (
                <>
                  <td className="py-1">{formatNumber(m.raw_value)}</td>
                  <td className="py-1 text-gray-500">{formatNumber(m.baseline_value)}</td>
                  <td className={`py-1 font-semibold ${typeof m.index === 'number' && m.index >= 1 ? 'text-green-600' : 'text-gray-500'}`}>{formatIndex(m.index)}</td>
                </>
              ) : (
                <td colSpan={3} className="py-1 text-gray-400 italic">{m.unavailable_reason ?? 'unavailable'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-gray-500">{compositeLabel}: <span className="font-semibold">{formatIndex(compositeIndex)}</span> baseline</div>
    </div>
  );
}

function MetricBreakdownTable({ breakdown }: { breakdown: PerformanceBreakdown }) {
  const platformMetrics = breakdown.metrics.filter((m) => m.category === 'platform');
  const businessMetrics = breakdown.metrics.filter((m) => m.category === 'business');
  return (
    <div>
      <MetricSection title="Platform performance (IG growth)" metrics={platformMetrics} compositeLabel="Platform composite index" compositeIndex={breakdown.platform_composite_index} />
      <MetricSection title="Business conversion (Fanvue)" metrics={businessMetrics} compositeLabel="Business conversion index" compositeIndex={breakdown.business_conversion_index} />
      <div className="mt-1 text-gray-500">Sample size: {breakdown.sample_size} · Normalized against {breakdown.comparable_sample_size} comparable posts.</div>
    </div>
  );
}

// F. Strategy Performance — closed-loop evaluation: did CI-guided posts actually outperform a
// comparable baseline, and how closely did the generated content follow the recommendation?
// Read-only measurement — never feeds back into 60/30/10, confidence thresholds, or bias
// strength (see lib/creativeIntelligence/outcomeEvaluator.ts's file header).

function formatUplift(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const pct = Math.round(value * 100);
  if (pct === 0) return '±0%';
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function medianMetricUplift(outcomes: StrategyOutcomeDTO[], metric: MetricUpliftEntryDTO['metric']): number | null {
  const values = outcomes
    .map((o) => o.platformUpliftDetail.find((d) => d.metric === metric))
    .filter((d): d is MetricUpliftEntryDTO => !!d && d.available && d.uplift !== null)
    .map((d) => d.uplift as number);
  return medianOf(values);
}

function StrategyPerformance({
  summary,
  outcomes,
  loading,
  error,
}: {
  summary: StrategyEffectivenessSummaryDTO | null;
  outcomes: StrategyOutcomeDTO[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Strategy Performance</h2>
        <p className="text-gray-500 text-sm">Loading closed-loop performance data…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Strategy Performance</h2>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }
  if (!summary || summary.matureCounts['72h'] === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-2">Strategy Performance</h2>
        <p className="text-sm text-gray-500">Not enough mature CI-guided posts yet.</p>
        {summary && summary.totalCiGuidedPosts > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {summary.totalCiGuidedPosts} CI-guided post{summary.totalCiGuidedPosts === 1 ? '' : 's'} tracked so far — none have reached the 72h checkpoint yet.
          </p>
        )}
      </div>
    );
  }

  const reachUplift = medianMetricUplift(outcomes, 'reach');
  const savesUplift = medianMetricUplift(outcomes, 'saves');
  const sharesUplift = medianMetricUplift(outcomes, 'shares');

  const ranked = outcomes.filter((o) => o.verdict !== 'insufficient_data' && o.platformUplift !== null).sort((a, b) => (b.platformUplift ?? 0) - (a.platformUplift ?? 0));
  const best = ranked.slice(0, 3);
  const weak = ranked.length > best.length ? ranked.slice(-3).reverse() : [];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-xl font-bold">Strategy Performance</h2>
        <span className="text-xs text-gray-400">Measured at 72h · read-only, never changes generation</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">Did content Creative Intelligence nudged us toward actually outperform a comparable baseline?</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="CI-guided posts" value={summary.totalCiGuidedPosts.toString()} />
        <Stat label="Mature 72h posts" value={summary.matureCounts['72h'].toString()} />
        <Stat label="Win rate" value={formatPercent(summary.winRate)} />
        <Stat label="Median platform uplift" value={formatUplift(summary.medianPlatformUplift)} />
        <Stat label="Reach uplift (median)" value={formatUplift(reachUplift)} />
        <Stat label="Saves uplift (median)" value={formatUplift(savesUplift)} />
        <Stat label="Shares uplift (median)" value={formatUplift(sharesUplift)} />
        <Stat label="Business (Fanvue) uplift" value={summary.avgBusinessUplift !== null ? formatUplift(summary.avgBusinessUplift) : 'Not tracked'} />
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">By strategy type</h3>
        <div className="grid grid-cols-3 gap-3">
          {(['proven', 'evolution', 'experiment'] as StrategyCategoryType[]).map((cat) => {
            const b = summary.byCategory[cat];
            return (
              <div key={cat} className="border rounded-lg p-3 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{STRATEGY_LABEL[cat]}</div>
                <div className="text-lg font-bold text-gray-800">{formatPercent(b.winRate)}</div>
                <div className="text-xs text-gray-500">win rate · {b.count} outcome{b.count === 1 ? '' : 's'}</div>
                <div className="text-xs text-gray-500 mt-1">median uplift {formatUplift(b.medianPlatformUplift)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {best.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Best CI decisions</h3>
          <div className="space-y-2">
            {best.map((o) => (
              <OutcomeCard key={`${o.postId}-${o.horizon}`} outcome={o} />
            ))}
          </div>
        </div>
      )}
      {weak.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Weak CI decisions</h3>
          <div className="space-y-2">
            {weak.map((o) => (
              <OutcomeCard key={`${o.postId}-${o.horizon}`} outcome={o} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// scored=true (default): highlighted green on match — a genuine tag/enum comparison that fed
// alignmentScore. scored=false: shown neutrally, no highlight — free text that was NEVER
// compared for scoring (see ContentAttributes' comment in outcomeEvaluator.ts for why).
function attrLine(label: string, recommended: string | null, actual: string | null, scored = true) {
  const matched = scored && !!recommended && !!actual && recommended.trim().toLowerCase() === actual.trim().toLowerCase();
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-gray-400 w-24 flex-shrink-0">{label}</span>
      <span className={matched ? 'text-green-700 font-medium' : 'text-gray-600'}>
        {actual ?? '—'} <span className="text-gray-400 font-normal">(recommended: {recommended ?? '—'})</span>
      </span>
    </div>
  );
}

function OutcomeCard({ outcome }: { outcome: StrategyOutcomeDTO }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded ${VERDICT_COLOR[outcome.verdict]}`}>{VERDICT_LABEL[outcome.verdict]}</span>
          <span className={`text-xs font-semibold px-2 py-1 rounded ${CATEGORY_COLOR[outcome.recommendationCategory] ?? 'bg-gray-100 text-gray-700'}`}>
            {STRATEGY_LABEL[outcome.recommendationCategory]}
          </span>
          <span className="text-xs text-gray-500">#{outcome.recommendationRank}</span>
        </div>
        <span className="text-xs text-gray-500">
          Platform uplift {formatUplift(outcome.platformUplift)} · Alignment {outcome.alignmentScore !== null ? formatPercent(outcome.alignmentScore) : 'n/a'}
        </span>
      </div>
      <div className="text-xs space-y-1 mb-2">
        {attrLine('Tier', outcome.recommended.tier, outcome.actual.tier)}
        {attrLine('Location family', outcome.recommended.location_family, outcome.actual.location_family)}
        {attrLine('Activity', outcome.recommended.activity, outcome.actual.activity)}
        {attrLine('Sexual energy', outcome.recommended.sexual_energy_level, outcome.actual.sexual_energy_level)}
        {attrLine('Shot style', outcome.recommended.shot_style, outcome.actual.shot_style)}
      </div>
      <details>
        <summary className="text-xs text-purple-600 cursor-pointer">Raw data</summary>
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          <div>
            Confidence at decision time: {formatPercent(outcome.recommendationConfidence)} · Comparable sample: {outcome.comparableSampleSize} posts over {outcome.baselineWindowDays}d
          </div>
          <div className="pt-1 border-t border-gray-100">
            <div className="text-gray-400 mb-0.5">Free text — diagnostic only, not scored (no reliable tag to compare):</div>
            {attrLine('Location', outcome.recommendedText.location, outcome.actualText.location, false)}
            {attrLine('Mood', outcome.recommendedText.mood, outcome.actualText.mood, false)}
          </div>
          <div>
            Raw: reach {formatCompactCount(outcome.rawMetrics.reach)} · saves {formatCompactCount(outcome.rawMetrics.saves)} · shares {formatCompactCount(outcome.rawMetrics.shares)} · views{' '}
            {formatCompactCount(outcome.rawMetrics.views)}
          </div>
          <div>
            Baseline (median): reach {formatCompactCount(outcome.baselineMetrics.reach)} · saves {formatCompactCount(outcome.baselineMetrics.saves)} · shares{' '}
            {formatCompactCount(outcome.baselineMetrics.shares)}
          </div>
          {outcome.businessUplift !== null && <div>Business (Fanvue) uplift: {formatUplift(outcome.businessUplift)}</div>}
          <div>
            Captured at {outcome.ageHours.toFixed(1)}h age · story day {outcome.storyDayId.slice(0, 8)}… · evidence posts: {outcome.evidencePostIds.length}
          </div>
        </div>
      </details>
    </div>
  );
}

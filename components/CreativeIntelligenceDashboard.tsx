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
  | 'fanvue_clicks';

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

interface ContentPattern {
  id: string;
  descriptor: {
    tier: string | null;
    moment_family: string | null;
    location: string | null;
    location_family: string | null;
    activity_family: string | null;
    sexual_energy_level: string | null;
  };
  status: 'proven' | 'evolution' | 'unproven';
  performance: PerformanceBreakdown | null;
  confidence_score: number;
}

interface PerformanceIntelligence {
  character_id: string;
  window_days: number;
  posts_analyzed: number;
  avg_growth_score: number;
  avg_reach: number;
  top_tier: string | null;
  patterns: ContentPattern[];
}

interface NextContentRecommendation {
  rank: number;
  category: 'proven' | 'evolution' | 'experiment';
  content_concept: string;
  why_selected: string;
  performance: PerformanceBreakdown | null;
  platform_composite_index: number | null;
  business_conversion_index: number | null;
  winning_axis: WinningAxis;
  objective: string;
  recommended_framing: {
    tier: string | null;
    moment_family: string | null;
    location: string | null;
    mood: string | null;
    lighting_hint: string | null;
  };
  recommended_motion: { motion_pattern_id: string; status: 'paired' | 'fallback_unproven'; reason: string; confidence_score: number } | null;
  confidence_score: number;
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

const METRIC_LABELS: Record<ExplainableMetric, string> = {
  reach: 'Reach',
  non_follower_reach: 'Non-follower reach',
  follows: 'Follows',
  profile_visits: 'Profile visits',
  watch_completion: 'Watch completion',
  saves: 'Saves',
  shares: 'Shares',
  engagement: 'Engagement rate',
  fanvue_clicks: 'Fanvue clicks',
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

// Snapshot JSON is persisted (chs_ci_strategy_snapshots) and can be older than the code
// currently reading it — a schema change (like the platform/business split) can leave a
// stored snapshot with fields missing entirely (undefined), not just null. `!== null` checks
// don't catch that, so every numeric/enum display sourced from strategy JSON goes through
// these helpers instead of a raw `.toFixed()` / direct Record lookup.
function formatIndex(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}x` : '—';
}

function formatPercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatNumber(value: unknown, decimals = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '—';
}

function formatCount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
}

function safeWinningAxis(value: unknown): WinningAxis {
  return value === 'platform' || value === 'business' || value === 'both' || value === 'neither' ? value : 'neither';
}

export default function CreativeIntelligenceDashboard() {
  const [intelligence, setIntelligence] = useState<PerformanceIntelligence | null>(null);
  const [strategy, setStrategy] = useState<NextContentStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [analyzeRes, strategyRes] = await Promise.all([
        fetch('/api/creative-intelligence/analyze?days=30'),
        fetch('/api/creative-intelligence/strategy?days=7'),
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

  const provenPatterns = intelligence?.patterns.filter((p) => p.status === 'proven') ?? [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-8 text-white">
          <h1 className="text-4xl font-bold mb-2">Creative Intelligence</h1>
          <p className="text-purple-100">
            What&apos;s working on Instagram, why, and what to make next — based only on real, imported IG metrics,
            normalized against this account&apos;s own baseline.
          </p>
        </div>

        {loading && <div className="bg-white rounded-lg shadow p-6 text-gray-500">Loading real performance data…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error}</div>}

        {!loading && !error && intelligence && (
          <>
            {/* 1. Performance This Window — real metrics only */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Performance (last {intelligence.window_days} days)</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Posts with real metrics" value={intelligence.posts_analyzed.toString()} />
                <Stat label="Avg reach" value={formatCount(intelligence.avg_reach)} />
                <Stat label="Top-performing tier" value={intelligence.top_tier ?? '—'} />
              </div>
              {intelligence.posts_analyzed === 0 && (
                <p className="mt-4 text-sm text-gray-500">
                  No scored posts yet in this window. Metrics import daily via the existing IG insights cron —
                  once posts have real engagement data, patterns will appear here.
                </p>
              )}
            </div>

            {/* 2. Proven Patterns — read-only, what's working and why, with full breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Proven Patterns</h2>
              {provenPatterns.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No pattern has cleared the proven bar yet (needs ≥3 real posts of the same combination,
                  outperforming this character&apos;s own baseline on comparable posts).
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {provenPatterns.map((p) => (
                    <div key={p.id} className="border rounded-lg p-4 bg-green-50/40">
                      <div className="font-semibold text-sm mb-2">
                        {[p.descriptor.tier, p.descriptor.moment_family, p.descriptor.location_family, p.descriptor.activity_family]
                          .filter(Boolean)
                          .join(' · ') || 'Untitled pattern'}
                      </div>
                      <div className="text-xs text-gray-500 mb-2 flex items-center gap-2 flex-wrap">
                        <span>{p.performance?.sample_size} posts · confidence {formatPercent(p.confidence_score)}</span>
                        {p.performance && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${WINNING_AXIS_COLOR[safeWinningAxis(p.performance.winning_axis)]}`}>
                            {WINNING_AXIS_LABEL[safeWinningAxis(p.performance.winning_axis)]}
                          </span>
                        )}
                      </div>
                      {p.performance && <MetricBreakdownTable breakdown={p.performance} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Next Content Strategy — the primary output */}
            {strategy && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-2">Recommended Next Content</h2>
                {strategy.data_status === 'insufficient_history' ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                    Not enough real performance history yet for a proven/evolution/experiment split — every
                    recommendation below is exploratory until more posts have been scored.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-6 mb-6">
                    <BreakdownStat label="Proven (60%)" value={strategy.breakdown.proven} color="text-green-600" />
                    <BreakdownStat label="Evolution (30%)" value={strategy.breakdown.evolution} color="text-blue-600" />
                    <BreakdownStat label="Experiment (10%)" value={strategy.breakdown.experiment} color="text-purple-600" />
                  </div>
                )}

                <div className="space-y-4">
                  {strategy.recommendations.map((rec) => (
                    <div key={rec.rank} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${CATEGORY_COLOR[rec.category]}`}>
                            {rec.category.toUpperCase()}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${WINNING_AXIS_COLOR[safeWinningAxis(rec.winning_axis)]}`}>
                            {WINNING_AXIS_LABEL[safeWinningAxis(rec.winning_axis)]}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">Confidence {formatPercent(rec.confidence_score)}</span>
                      </div>
                      <div className="font-semibold mb-1">{rec.content_concept}</div>
                      <div className="text-sm text-gray-600 mb-2">{rec.why_selected}</div>
                      <div className="flex gap-4 text-xs text-gray-500 mb-3">
                        <span>Platform index: <span className="font-semibold text-gray-700">{formatIndex(rec.platform_composite_index)}</span></span>
                        <span>Business (Fanvue) index: <span className="font-semibold text-gray-700">{formatIndex(rec.business_conversion_index)}</span></span>
                      </div>

                      {rec.performance && (
                        <details className="mb-3">
                          <summary className="text-xs text-purple-600 cursor-pointer hover:text-purple-700">
                            View performance breakdown
                          </summary>
                          <div className="mt-2">
                            <MetricBreakdownTable breakdown={rec.performance} />
                          </div>
                        </details>
                      )}

                      <div className="text-xs text-gray-500 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>Objective: {rec.objective}</div>
                        <div>Tier: {rec.recommended_framing.tier ?? '—'}</div>
                        <div>Location: {rec.recommended_framing.location ?? '—'}</div>
                        <div>
                          Motion: {rec.recommended_motion?.motion_pattern_id ?? '—'}
                          {rec.recommended_motion?.status === 'fallback_unproven' && (
                            <span className="ml-1 text-amber-600">(unproven fallback)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricSection({ title, metrics, compositeLabel, compositeIndex }: {
  title: string;
  metrics: MetricBreakdownEntry[];
  compositeLabel: string;
  compositeIndex: number | null;
}) {
  return (
    <div className="mb-2">
      <div className="text-gray-400 uppercase tracking-wide text-[10px] mb-1">{title}</div>
      <table className="w-full">
        <thead>
          <tr className="text-gray-400 text-left">
            <th className="font-normal pb-1">Metric</th>
            <th className="font-normal pb-1">This pattern</th>
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
                  <td className={`py-1 font-semibold ${typeof m.index === 'number' && m.index >= 1 ? 'text-green-600' : 'text-gray-500'}`}>
                    {formatIndex(m.index)}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="py-1 text-gray-400 italic">
                  {m.unavailable_reason ?? 'unavailable'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-gray-500">
        {compositeLabel}: <span className="font-semibold">{formatIndex(compositeIndex)}</span> baseline
      </div>
    </div>
  );
}

function MetricBreakdownTable({ breakdown }: { breakdown: PerformanceBreakdown }) {
  const platformMetrics = breakdown.metrics.filter((m) => m.category === 'platform');
  const businessMetrics = breakdown.metrics.filter((m) => m.category === 'business');
  return (
    <div className="text-xs">
      <MetricSection title="Platform performance (IG growth)" metrics={platformMetrics} compositeLabel="Platform composite index" compositeIndex={breakdown.platform_composite_index} />
      <MetricSection title="Business conversion (Fanvue)" metrics={businessMetrics} compositeLabel="Business conversion index" compositeIndex={breakdown.business_conversion_index} />
      <div className="mt-1 text-gray-500">Normalized against {breakdown.comparable_sample_size} comparable posts (same post type, same window).</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
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

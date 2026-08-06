'use client';

import { useState, useEffect } from 'react';

interface VideoSpec {
  video_id: string;
  category: 'proven' | 'evolution' | 'experiment';
  motion_pattern: {
    id: string;
    name: string;
    kling_prompt: string;
    expected_performance: {
      watch_time_avg: number;
      engagement_score: number;
    };
  };
  higgsfield_config: {
    id: string;
    prompt: string;
    lighting: string;
    color_palette: string[];
  };
  production_priority: string;
}

interface Batch {
  batch_id: string;
  timestamp: string;
  videos: VideoSpec[];
  strategy_breakdown: {
    proven: { target: number; percentage: number };
    evolution: { target: number; percentage: number };
    experiment: { target: number; percentage: number };
  };
}

interface Report {
  generated_at: string;
  summary: {
    videos_analyzed: number;
    avg_completion_rate: number;
    total_impressions: number;
    total_engagement: number;
  };
  top_patterns: Array<{
    name: string;
    success_rate: number;
    watch_time: number;
  }>;
}

export default function CreativeIntelligenceDashboard() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingVideoId, setGeneratingVideoId] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<Set<string>>(new Set());

  // Load batch on mount
  useEffect(() => {
    loadBatch();
  }, []);

  const loadBatch = async () => {
    try {
      const res = await fetch('/api/creative-intelligence/daily-batch');
      const data = await res.json();

      if (data.success) {
        setBatch(data.batch);
        loadReport();
      }
    } catch (error) {
      console.error('Error loading batch:', error);
    }
  };

  const loadReport = async () => {
    try {
      const reportPath = 'data/daily_optimization_report.json';
      // Note: This would need a separate API endpoint
      // For now, we'll load it via the optimizer trigger
    } catch (error) {
      console.error('Error loading report:', error);
    }
  };

  const triggerOptimizer = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/creative-intelligence/trigger-optimizer', {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        setBatch(data.batch);
        setReport(data.report);
      }
    } catch (error) {
      console.error('Error triggering optimizer:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateVideo = async (video: VideoSpec) => {
    setGeneratingVideoId(video.video_id);

    try {
      const res = await fetch('/api/creative-intelligence/generate-video', {
        method: 'POST',
        body: JSON.stringify({
          videoId: video.video_id,
          motionPatternId: video.motion_pattern.id,
          higgsFieldConfigId: video.higgsfield_config.id,
          higgsFieldPrompt: video.higgsfield_config.prompt,
          klingPrompt: video.motion_pattern.kling_prompt,
          durationSec: 10
        })
      });

      const data = await res.json();

      if (data.success) {
        setGeneratedVideos(prev => new Set(prev).add(video.video_id));
        alert(`✅ Video generated!\n\nFirst Frame: ${data.firstFrame.url}\nVideo: ${data.video.url}`);
      } else {
        alert(`❌ Generation failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error generating video:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setGeneratingVideoId(null);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'proven':
        return 'bg-green-100 text-green-800';
      case 'evolution':
        return 'bg-blue-100 text-blue-800';
      case 'experiment':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg p-8 text-white">
          <h1 className="text-4xl font-bold mb-2">🎭 Creative Intelligence</h1>
          <p className="text-purple-100">
            AI-powered video production strategy (prompts generated, click to create)
          </p>
        </div>

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold mb-2">Autonomous Optimizer</h2>
              <p className="text-gray-600">Runs daily at 6:00 AM to analyze IG metrics</p>
            </div>
            <button
              onClick={triggerOptimizer}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? '⏳ Running...' : '▶ Run Now'}
            </button>
          </div>
        </div>

        {/* Report Summary */}
        {report && (
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Videos Analyzed</div>
              <div className="text-3xl font-bold text-blue-600">
                {report.summary.videos_analyzed}
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Completion Rate</div>
              <div className="text-3xl font-bold text-green-600">
                {(report.summary.avg_completion_rate * 100).toFixed(0)}%
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Total Engagement</div>
              <div className="text-3xl font-bold text-purple-600">
                {report.summary.total_engagement.toLocaleString()}
              </div>
            </div>

            <div className="bg-pink-50 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Impressions</div>
              <div className="text-3xl font-bold text-pink-600">
                {(report.summary.total_impressions / 1000).toFixed(0)}K
              </div>
            </div>
          </div>
        )}

        {/* Top Patterns */}
        {report && report.top_patterns && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">⭐ Top Performing Patterns</h3>
            <div className="grid grid-cols-3 gap-4">
              {report.top_patterns.map((pattern, idx) => (
                <div
                  key={idx}
                  className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-200"
                >
                  <div className="font-semibold mb-2">{pattern.name}</div>
                  <div className="text-sm space-y-1 text-gray-600">
                    <div>Success: {(pattern.success_rate * 100).toFixed(0)}%</div>
                    <div>Watch Time: {pattern.watch_time.toFixed(1)}s</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Batch Composition */}
        {batch && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-6">📊 Batch Composition</h3>
            <div className="grid grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {batch.strategy_breakdown.proven.target}
                </div>
                <div className="text-sm text-gray-600">Proven (60%)</div>
                <div className="text-xs text-gray-500">Highest confidence</div>
              </div>

              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">
                  {batch.strategy_breakdown.evolution.target}
                </div>
                <div className="text-sm text-gray-600">Evolution (30%)</div>
                <div className="text-xs text-gray-500">Mutation testing</div>
              </div>

              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">
                  {batch.strategy_breakdown.experiment.target}
                </div>
                <div className="text-sm text-gray-600">Experiment (10%)</div>
                <div className="text-xs text-gray-500">Discovery</div>
              </div>
            </div>
          </div>
        )}

        {/* Videos Grid */}
        {batch && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-6">
              📹 Production Videos ({batch.videos.length} ready)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {batch.videos.map((video) => {
                const isGenerated = generatedVideos.has(video.video_id);
                const isGenerating = generatingVideoId === video.video_id;

                return (
                  <div
                    key={video.video_id}
                    className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    {/* Category Badge */}
                    <div className={`px-4 py-2 ${getCategoryColor(video.category)}`}>
                      <span className="font-semibold text-sm">
                        {video.category.toUpperCase()}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Motion Pattern</div>
                        <div className="font-semibold">{video.motion_pattern.name}</div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 mb-1">Lighting</div>
                        <div className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          {video.higgsfield_config.lighting}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">Watch Time</div>
                          <div className="font-semibold">
                            {video.motion_pattern.expected_performance.watch_time_avg.toFixed(1)}s
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Engagement</div>
                          <div className="font-semibold">
                            {(video.motion_pattern.expected_performance.engagement_score * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Generate Button */}
                      <button
                        onClick={() => generateVideo(video)}
                        disabled={isGenerating || isGenerated}
                        className={`w-full py-2 px-4 rounded font-semibold mt-4 ${
                          isGenerated
                            ? 'bg-green-500 text-white cursor-default'
                            : isGenerating
                            ? 'bg-gray-400 text-white cursor-wait'
                            : 'bg-purple-600 text-white hover:bg-purple-700'
                        }`}
                      >
                        {isGenerated
                          ? '✅ Generated'
                          : isGenerating
                          ? '⏳ Generating...'
                          : '🎬 Generate Video'}
                      </button>

                      {/* Prompts (collapsible preview) */}
                      <details className="mt-3">
                        <summary className="text-xs text-purple-600 cursor-pointer hover:text-purple-700">
                          View Prompts
                        </summary>
                        <div className="mt-2 space-y-2 text-xs bg-gray-50 p-3 rounded">
                          <div>
                            <div className="font-semibold text-gray-700">Higgsfield:</div>
                            <div className="text-gray-600 line-clamp-2">
                              {video.higgsfield_config.prompt}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-700">Kling:</div>
                            <div className="text-gray-600 line-clamp-2">
                              {video.motion_pattern.kling_prompt}
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!batch && (
          <div className="bg-gray-50 rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-xl font-bold mb-2">No batch generated yet</h3>
            <p className="text-gray-600 mb-6">Click "Run Now" to trigger the optimizer</p>
            <button
              onClick={triggerOptimizer}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Running...' : 'Run Optimizer Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

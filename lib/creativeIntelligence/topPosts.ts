import type { AnalyzedPost } from "./igAnalyticsAdapter";
import { buildPerformanceBreakdown } from "./scoring";
import { METRIC_LABELS } from "./describeBreakdown";
import type { PerformanceBreakdown, TopPost } from "./types";

// Top Posts (B): the concrete winners themselves — a single Reel that hit 123.7k reach never
// gets averaged away inside a 6-post pattern here. Each post is scored against the SAME
// comparable-post baseline the pattern layer uses (same post_type, same window), just with
// sample_size=1, so "this post vs your typical post" is directly comparable to pattern-level
// numbers.

function describeWhyInteresting(breakdown: PerformanceBreakdown, postType: string): string {
  const strong = breakdown.metrics
    .filter((m) => m.available && m.index !== null && m.index > 1 && m.metric !== "engagement" && m.metric !== "total_interactions")
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, 2);

  const label = postType === "reel" ? "This Reel" : postType === "carousel" ? "This carousel" : "This post";

  if (strong.length === 0) {
    return `${label} performed close to this character's typical post — no metric stood out clearly above baseline yet.`;
  }
  const clauses = strong.map((m) => `${m.index!.toFixed(1)}x more ${METRIC_LABELS[m.metric]}`);
  return `${label} reached ${clauses.join(" and generated ")} than a typical post.`;
}

// posts: ALL scored posts in the window (not grouped) — every post is its own baseline
// comparison against the other posts of the same post_type.
export function computeTopPosts(posts: AnalyzedPost[], limit = 10): TopPost[] {
  const byPostType = new Map<string, AnalyzedPost[]>();
  for (const p of posts) {
    const type = p.performance.post_type;
    if (!byPostType.has(type)) byPostType.set(type, []);
    byPostType.get(type)!.push(p);
  }

  const withReach = posts.filter((p) => typeof p.performance.reach === "number");
  const sorted = [...withReach].sort((a, b) => (b.performance.reach ?? 0) - (a.performance.reach ?? 0));

  return sorted.slice(0, limit).map((post) => {
    const baselinePosts = byPostType.get(post.performance.post_type) ?? posts;
    const breakdown = buildPerformanceBreakdown([post], baselinePosts);

    // For a single post, "no comparable posts" is the wrong reason when what's actually
    // missing is THIS post's own fanvue_clicks value — say so plainly instead ("Fanvue
    // conversion data not tracked for this post"), never showing 0 for a value we never entered.
    if (post.performance.fanvue_clicks === undefined) {
      const fanvue = breakdown.metrics.find((m) => m.metric === "fanvue_clicks");
      if (fanvue && !fanvue.available) fanvue.unavailable_reason = "Fanvue conversion data not tracked for this post.";
    }

    return {
      post_id: post.performance.post_id,
      media_url: post.media_url,
      thumbnail_url: post.thumbnail_url,
      post_type: post.performance.post_type,
      posted_at: post.performance.posted_at,
      tier: post.descriptor.tier,
      location: post.descriptor.location,
      views: post.performance.views ?? null,
      likes: post.performance.likes ?? null,
      comments: post.performance.comments ?? null,
      performance: breakdown,
      why_interesting: describeWhyInteresting(breakdown, post.performance.post_type),
    };
  });
}

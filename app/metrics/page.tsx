import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import MetricsClient from "./MetricsClient";
import { getGrowthBias, countScoredReels, REEL_METRICS_THRESHOLD } from "@/lib/growthScore";
import { isFlagOn } from "@/lib/featureFlags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const sinceStr = new Date(Date.now() - 21 * 86400000).toISOString();

  const [{ data: characters }, { data: posts }] = await Promise.all([
    supabase.from("chs_characters").select("id, name, feature_flags").eq("is_active", true),
    supabase
      .from("chs_posts")
      .select("id, character_id, post_type, status, growth_score, growth_winner, engagement, ig_caption, story_day_id, posted_at, scheduled_at, created_at")
      .gte("created_at", sinceStr)
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  // Per-character growth state (bias is gated until ≥ REEL_METRICS_THRESHOLD scored reels).
  const charState: Record<string, { growthOn: boolean; scoredReels: number; bias: Awaited<ReturnType<typeof getGrowthBias>> }> = {};
  for (const c of characters ?? []) {
    const [scoredReels, bias] = await Promise.all([countScoredReels(c.id), getGrowthBias(c.id)]);
    charState[c.id] = { growthOn: isFlagOn(c.feature_flags, "growth_layer"), scoredReels, bias };
  }

  return { characters: characters ?? [], posts: posts ?? [], charState, threshold: REEL_METRICS_THRESHOLD };
}

export default async function MetricsPage() {
  const data = await getData();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Growth · Metrics Import</h1>
        </div>
        <MetricsClient {...data} />
      </main>
    </div>
  );
}

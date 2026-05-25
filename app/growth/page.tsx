import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import GrowthClient from "./GrowthClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const today = new Date().toISOString().split("T")[0];
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const fourteenDaysAgoStr = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [{ data: characters }, { data: todayStory }, { data: todayPlans }, { data: weekPosts }, { data: recentPosts }] =
    await Promise.all([
      supabase.from("chs_characters").select("id, name, slug").eq("is_active", true),
      supabase
        .from("chs_story_days")
        .select("id, character_id, tier, drift_seeds, emotional_beat, mood, location, created_at")
        .eq("date", today),
      supabase
        .from("chs_daily_plans")
        .select("id, character_id, batch_status, scene_brief, created_at")
        .eq("date", today),
      supabase
        .from("chs_posts")
        .select("id, character_id, platform, post_type, scheduled_at, posted_at, status")
        .gte("scheduled_at", weekStartStr)
        .in("status", ["scheduled", "posted"]),
      supabase
        .from("chs_posts")
        .select("id, character_id, post_type, posted_at, platform")
        .gte("posted_at", fourteenDaysAgoStr)
        .eq("status", "posted"),
    ]);

  const batchIds = (todayPlans ?? []).map((p) => p.id);
  const { data: todayMedia } = batchIds.length > 0
    ? await supabase
        .from("chs_media")
        .select("id, batch_id, channel, slot, generation_status")
        .in("batch_id", batchIds)
    : { data: [] };

  return {
    characters: characters ?? [],
    todayStory: todayStory ?? [],
    todayPlans: todayPlans ?? [],
    todayMedia: todayMedia ?? [],
    weekPosts: weekPosts ?? [],
    recentPosts: recentPosts ?? [],
    today,
    weekStartStr,
  };
}

export default async function GrowthPage() {
  const data = await getData();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">
            Daily Status
          </h1>
          <span className="font-mono text-[10px] text-muted">
            {new Date().toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <GrowthClient {...data} />
      </main>
    </div>
  );
}

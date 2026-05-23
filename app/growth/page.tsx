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
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: characters }, { data: storyDays }, { data: weekPosts }, { data: recentPosts }] =
    await Promise.all([
      supabase.from("chs_characters").select("id, name, slug").eq("is_active", true),
      supabase
        .from("chs_story_days")
        .select("id, character_id, date, location, mood, narrative, arc_position")
        .gte("date", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .order("date", { ascending: false }),
      supabase
        .from("chs_posts")
        .select("id, character_id, platform, post_type, scheduled_at, posted_at, status")
        .gte("scheduled_at", weekStartStr)
        .in("status", ["scheduled", "posted"]),
      supabase
        .from("chs_posts")
        .select("id, character_id, platform, post_type, scheduled_at, posted_at, status, chs_story_days:chs_media(story_day_id)")
        .gte("created_at", fourteenDaysAgo)
        .eq("status", "posted"),
    ]);

  return {
    characters: characters ?? [],
    storyDays: storyDays ?? [],
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
            Daily Growth System
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

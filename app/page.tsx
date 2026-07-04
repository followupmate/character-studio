import { supabase } from "@/lib/supabase";
import { Character, StoryDay, Media, TopPostSummary } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import Dashboard from "@/components/dashboard/Dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const today = new Date().toISOString().split("T")[0];
  const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

  const [{ data: characters }, { data: todayStories }, { data: photos }, { data: topPosts }] = await Promise.all([
    supabase
      .from("chs_characters")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("chs_story_days")
      .select("*, chs_media(*)")
      .eq("date", today)
      .order("created_at", { ascending: false }),
    // Only the most recent photos are needed — one per character for the card
    // thumbnail. Bounded so the query cost doesn't grow with the whole history.
    supabase
      .from("chs_media")
      .select("media_url, chs_story_days(character_id)")
      .eq("type", "photo")
      .eq("status", "ready")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(60),
    // Money view: best-performing posts of the last 14 days (auto-scored by import-insights)
    supabase
      .from("chs_posts")
      .select("id, post_type, growth_score, growth_winner, engagement, posted_at, character_id")
      .eq("status", "posted")
      .gt("growth_score", 0)
      .gte("posted_at", since14d)
      .order("growth_score", { ascending: false })
      .limit(5),
  ]);

  // latest photo URL per character
  const photoMap: Record<string, string> = {};
  for (const p of (photos ?? []) as any[]) {
    const charId = p.chs_story_days?.character_id;
    if (charId && !photoMap[charId]) photoMap[charId] = p.media_url;
  }

  return {
    characters: (characters as Character[]) ?? [],
    todayStories: (todayStories as (StoryDay & { chs_media: Media[] })[]) ?? [],
    photoMap,
    topPosts: (topPosts as TopPostSummary[]) ?? [],
  };
}

export default async function Home() {
  const { characters, todayStories, photoMap, topPosts } = await getData();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <Dashboard characters={characters} todayStories={todayStories} photoMap={photoMap} topPosts={topPosts} />
      </main>
    </div>
  );
}

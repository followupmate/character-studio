import { supabase } from "@/lib/supabase";
import { Character, StoryDay, Media } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import Dashboard from "@/components/dashboard/Dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const today = new Date().toISOString().split("T")[0];

  const [{ data: characters }, { data: todayStories }, { data: photos }] = await Promise.all([
    supabase
      .from("chs_characters")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("chs_story_days")
      .select("*, chs_media(*)")
      .eq("date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("chs_media")
      .select("media_url, chs_story_days(character_id)")
      .eq("type", "photo")
      .eq("status", "ready")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false }),
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
  };
}

export default async function Home() {
  const { characters, todayStories, photoMap } = await getData();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <Dashboard characters={characters} todayStories={todayStories} photoMap={photoMap} />
      </main>
    </div>
  );
}

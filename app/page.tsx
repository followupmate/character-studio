import { supabase } from "@/lib/supabase";
import { Character, StoryDay, Media } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import Dashboard from "@/components/dashboard/Dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const today = new Date().toISOString().split("T")[0];

  const [{ data: characters }, { data: todayStories }] = await Promise.all([
    supabase
      .from("chs_characters")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("chs_story_days")
      .select("*, chs_media(*)")
      .eq("date", today)
      .order("created_at", { ascending: false }),
  ]);

  return {
    characters: (characters as Character[]) ?? [],
    todayStories: (todayStories as (StoryDay & { chs_media: Media[] })[]) ?? [],
  };
}

export default async function Home() {
  const { characters, todayStories } = await getData();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56">
        <Dashboard characters={characters} todayStories={todayStories} />
      </main>
    </div>
  );
}

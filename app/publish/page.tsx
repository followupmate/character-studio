import { supabase } from "@/lib/supabase";
import { Character } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import PublishClient from "./PublishClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getData() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: characters }, { data: posts }] = await Promise.all([
    supabase
      .from("chs_characters")
      .select("id, name, slug, posting_time, platforms")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("chs_posts")
      .select(
        `id, platform, status, scheduled_at, posted_at, ig_caption, yt_title, character_id,
         chs_characters(name, slug),
         chs_media(type, media_url)`
      )
      .gte("created_at", thirtyDaysAgo)
      .order("scheduled_at", { ascending: false }),
  ]);

  return {
    characters: (characters as Pick<Character, "id" | "name" | "slug" | "posting_time" | "platforms">[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialQueue: (posts ?? []) as any[],
  };
}

export default async function PublishPage() {
  const { characters, initialQueue } = await getData();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Publish Queue</h1>
          <span className="font-mono text-[10px] text-muted hidden sm:block">
            {new Date().toLocaleDateString("sk-SK", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <PublishClient characters={characters} initialQueue={initialQueue} />
      </main>
    </div>
  );
}

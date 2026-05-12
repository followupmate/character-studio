import { supabase } from "@/lib/supabase";
import { Character } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import CharacterGrid from "@/components/characters/CharacterGrid";

export const dynamic = "force-dynamic";

async function getData() {
  const [{ data: characters }, { data: photos }] = await Promise.all([
    supabase
      .from("chs_characters")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("chs_media")
      .select("media_url, chs_story_days(character_id)")
      .eq("type", "photo")
      .eq("status", "ready")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  const photoMap: Record<string, string> = {};
  for (const p of (photos ?? []) as any[]) {
    const charId = p.chs_story_days?.character_id;
    if (charId && !photoMap[charId]) photoMap[charId] = p.media_url;
  }

  return {
    characters: (characters as Character[]) ?? [],
    photoMap,
  };
}

export default async function CharactersPage() {
  const { characters, photoMap } = await getData();
  const activeCount = characters.filter((c) => c.is_active).length;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Charaktery</h1>
          <span className="font-mono text-[10px] text-muted">{characters.length} spolu</span>
        </div>

        <div className="p-4 lg:p-8">
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">DIRECTORY_001</p>
          <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-8">
            Active Personalities
          </h2>
          <CharacterGrid characters={characters} activeCount={activeCount} photoMap={photoMap} />
        </div>
      </main>
    </div>
  );
}

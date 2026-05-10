import { supabase } from "@/lib/supabase";
import { Character } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import SoulIdStatus from "@/components/dashboard/SoulIdStatus";

export const dynamic = "force-dynamic";

async function getCharacters(): Promise<Character[]> {
  const { data } = await supabase
    .from("chs_characters")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as Character[]) ?? [];
}

const platformStyles: Record<string, string> = {
  instagram: "border-red-500/30 text-red-400",
  youtube: "border-amber/30 text-amber",
  tiktok: "border-accent/30 text-accent",
};

export default async function CharactersPage() {
  const characters = await getCharacters();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Charaktery</h1>
          <span className="font-mono text-[10px] text-muted">{characters.length} spolu</span>
        </div>

        <div className="p-4 lg:p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Zoznam</p>
          <h2 className="text-2xl font-medium text-white mb-1">Charaktery</h2>
          <p className="text-sm text-muted2 mb-8">
            Každý charakter má vlastný Soul ID, backstory a automatický posting.
          </p>

          <div className="grid grid-cols-3 gap-4">
            {characters.map((char) => (
              <div key={char.id} className="bg-bg2 border border-border rounded-md p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-medium text-sm mb-0.5">{char.name}</div>
                    <div className="font-mono text-[9px] text-muted tracking-wider">/{char.slug}</div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                      char.is_active ? "bg-teal" : "bg-muted"
                    }`}
                    title={char.is_active ? "Aktívny" : "Neaktívny"}
                  />
                </div>

                {/* Soul ID */}
                <div className="bg-bg3 border border-border rounded px-3 py-2 mb-3">
                  <SoulIdStatus soulId={char.soul_id} characterName={char.name} />
                </div>

                {/* Platforms */}
                <div className="flex gap-1.5 mb-3">
                  {char.platforms.map((p) => (
                    <span
                      key={p}
                      className={`font-mono text-[8px] border px-1.5 py-0.5 rounded-sm ${
                        platformStyles[p] ?? "border-border2 text-muted2"
                      }`}
                    >
                      {p.toUpperCase().slice(0, 2)}
                    </span>
                  ))}
                </div>

                {/* Posting time */}
                <div className="font-mono text-[9px] text-muted">
                  Posting: <span className="text-muted2">{char.posting_time}</span>
                </div>
              </div>
            ))}

            {/* New character placeholder */}
            <div className="bg-bg2 border border-border border-dashed rounded-md p-5 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-teal/40 hover:bg-bg3 transition-colors min-h-[160px]">
              <span className="text-3xl text-muted">+</span>
              <span className="font-mono text-[9px] text-muted tracking-wider">NOVÝ CHARAKTER</span>
              <span className="font-mono text-[8px] text-muted/60 text-center leading-relaxed">
                SQL INSERT do<br />chs_characters
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

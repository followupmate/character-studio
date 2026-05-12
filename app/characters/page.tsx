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

export default async function CharactersPage() {
  const characters = await getCharacters();
  const activeCount = characters.filter((c) => c.is_active).length;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Charaktery</h1>
          <span className="font-mono text-[10px] text-muted">{characters.length} spolu</span>
        </div>

        <div className="p-4 lg:p-8">
          {/* Eyebrow + heading */}
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">DIRECTORY_001</p>
          <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-8">
            Active Personalities
          </h2>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border mb-px">
            {characters.map((char) => (
              <div key={char.id} className="bg-surface p-5 flex flex-col gap-3 hover:bg-surface-low transition-colors">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.05em] font-medium text-ink mb-0.5">
                      {char.name}
                    </div>
                    <div className="font-mono text-[9px] text-muted tracking-wider">/{char.slug}</div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${char.is_active ? "bg-teal" : "bg-muted"}`}
                    title={char.is_active ? "Aktívny" : "Neaktívny"}
                  />
                </div>

                {/* Soul ID */}
                <div className="bg-surface-low border border-border px-3 py-2">
                  <SoulIdStatus soulId={char.soul_id} characterName={char.name} />
                </div>

                {/* Platforms */}
                <div className="flex gap-1.5">
                  {char.platforms.map((p) => (
                    <span
                      key={p}
                      className={`font-mono text-[8px] border px-1.5 py-0.5 ${
                        p === "instagram"
                          ? "border-red-500/30 text-red-400"
                          : p === "youtube"
                          ? "border-amber/30 text-amber"
                          : "border-accent/30 text-accent"
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

            {/* New character */}
            <a
              href="/create"
              className="bg-surface border border-border border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-teal/40 hover:bg-surface-low transition-colors p-5 min-h-[180px]"
            >
              <span className="material-symbols-outlined text-[28px] text-muted">add_circle</span>
              <div className="text-center">
                <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Nový charakter</div>
                <div className="font-mono text-[8px] text-muted/60 mt-1">→ /create</div>
              </div>
            </a>
          </div>

          {/* Footer stats */}
          <div className="flex items-center gap-8 border border-border px-5 py-3 bg-surface">
            <div className="font-mono text-[9px] text-muted">
              TOTAL_ENTITIES <span className="text-ink ml-2">{characters.length}</span>
            </div>
            <div className="font-mono text-[9px] text-muted">
              ACTIVE <span className="text-teal ml-2">{activeCount}</span>
            </div>
            <div className="font-mono text-[9px] text-muted">
              SYSTEM <span className="text-teal ml-2">ONLINE</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

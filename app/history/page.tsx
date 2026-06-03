import { supabase } from "@/lib/supabase";
import { Character, StoryDay } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

type HistoryRow = StoryDay & {
  chs_characters: Pick<Character, "name" | "slug">;
};

async function getHistory(): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("*, chs_characters(name, slug)")
    .order("day_number", { ascending: false });
  return (data as HistoryRow[]) ?? [];
}

const arcColors: Record<string, string> = {
  opening: "text-teal",
  rising: "text-accent",
  peak: "text-amber",
  turning: "text-amber",
  falling: "text-muted2",
  quiet: "text-muted2",
};

export default async function HistoryPage() {
  const rows = await getHistory();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">História</h1>
          <span className="font-mono text-[10px] text-muted">{rows.length} dní</span>
        </div>

        <div className="p-4 lg:p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Archív</p>
          <h2 className="text-2xl font-medium text-white mb-1">História príbehov</h2>
          <p className="text-sm text-muted2 mb-8">
            Všetky vygenerované dni. Klikni na riadok pre zobrazenie naratívu.
          </p>

          {rows.length === 0 ? (
            <div className="bg-bg2 border border-border border-dashed rounded-md p-12 text-center">
              <div className="text-4xl mb-4">◷</div>
              <p className="text-white font-medium mb-2">Žiadna história</p>
              <p className="text-sm text-muted">Príbehy sa zobrazia tu po prvom generovaní.</p>
            </div>
          ) : (
            <div className="bg-bg2 border border-border rounded-md overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[64px_100px_160px_1fr_120px_100px] gap-4 px-5 py-3 border-b border-border bg-bg3">
                {["Deň", "Dátum", "Charakter", "Lokácia · Nálada", "Arc", ""].map((h) => (
                  <div key={h} className="font-mono text-[8px] tracking-widest text-muted uppercase">
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {rows.map((row, i) => (
                <details
                  key={row.id}
                  className={`group ${i !== rows.length - 1 ? "border-b border-border" : ""}`}
                >
                  <summary className="grid grid-cols-[64px_100px_160px_1fr_120px_100px] gap-4 px-5 py-3.5 cursor-pointer hover:bg-bg3 transition-colors list-none items-center">
                    {/* Day */}
                    <div className="font-mono text-[10px] text-accent">#{row.day_number}</div>

                    {/* Date */}
                    <div className="font-mono text-[10px] text-muted">{row.date}</div>

                    {/* Character */}
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink">{row.chs_characters?.name ?? "—"}</span>
                      <span className="font-mono text-[8px] text-muted">/{row.chs_characters?.slug}</span>
                    </div>

                    {/* Location + mood */}
                    <div className="font-mono text-[10px] text-muted2 truncate">
                      <span className="text-teal">📍 {row.location}</span>
                      <span className="text-muted mx-1.5">·</span>
                      <span className="italic">{row.mood}</span>
                    </div>

                    {/* Arc */}
                    <div
                      className={`font-mono text-[9px] tracking-wider ${
                        arcColors[row.arc_position] ?? "text-muted2"
                      }`}
                    >
                      {row.arc_position}
                    </div>

                    {/* Expand indicator */}
                    <div className="font-mono text-[9px] text-muted text-right group-open:text-accent transition-colors">
                      <span className="group-open:hidden">▸ detail</span>
                      <span className="hidden group-open:inline">▾ zatvoriť</span>
                    </div>
                  </summary>

                  {/* Expanded narrative */}
                  <div className="px-5 pb-5 pt-1 bg-bg3 border-t border-border">
                    <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-2">
                      // Naratív — Deň {row.day_number}
                    </p>
                    <p className="text-sm text-ink italic leading-relaxed border-l-2 border-border2 pl-4 mb-3">
                      {row.narrative}
                    </p>
                    {row.next_hint && (
                      <p className="font-mono text-[9px] text-muted italic">
                        → Zajtra: {row.next_hint}
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA, VIKA_VOID, LUNA, MARA } from "@/lib/archetypes";

const MINI_CARDS = [
  {
    preset: VIKA_VOID,
    tags: ["Cyberpunk", "Eastern European"],
    color: "#4a9eff",
  },
  {
    preset: LUNA,
    tags: ["Cozy", "Anime Vibe"],
    color: "#ff9eb5",
  },
  {
    preset: MARA,
    tags: ["Dark Luxury", "High Fashion"],
    color: "#c9a84c",
  },
];

export default function CreatePage() {
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPreset(preset: CharacterDNA) {
    localStorage.setItem("selected_archetype", JSON.stringify(preset));
    localStorage.setItem("character_dna", JSON.stringify(preset));
    localStorage.setItem("create_method", "preset");
    router.push("/create/dna");
  }

  async function generateWithAI() {
    if (!concept.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/generate-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generovanie zlyhalo");
      localStorage.setItem("character_dna", JSON.stringify(data.dna));
      localStorage.removeItem("selected_archetype");
      localStorage.setItem("create_method", "ai");
      router.push("/create/dna");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznáma chyba");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Nový influencer</h1>
        </div>

        <div className="p-4 lg:p-8 max-w-5xl">
          <StepProgress current={1} total={5} label="Štart" />

          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-3">
            // Krok 1 z 5 — Štart
          </p>
          <h2 className="text-3xl font-medium text-white mb-2 leading-tight">
            Vytvor svojho <span className="italic text-muted2">AI influencera</span>
          </h2>
          <p className="text-sm text-muted2 mb-10 max-w-xl">
            Vyber predpripravený archetype alebo opíš vlastný koncept a AI vygeneruje celý profil.
          </p>

          {/* Two paths */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-0">
            {/* PATH A — Presets */}
            <div className="bg-bg2 border border-border rounded-md p-6">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-1">Rýchly štart</p>
              <p className="text-white font-medium text-sm mb-1">Preset Archetype</p>
              <p className="text-[12px] text-muted2 mb-5">
                Vyber predpripravený koncept. DNA sa predvyplní automaticky.
              </p>
              <div className="space-y-3">
                {MINI_CARDS.map(({ preset, tags, color }) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between bg-bg3 border border-border rounded px-4 py-3 hover:border-border2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] font-bold mb-1" style={{ color }}>
                        {preset.name}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="font-mono text-[8px] border px-1.5 py-0.5 rounded-sm"
                            style={{ borderColor: `${color}40`, color: `${color}cc` }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => selectPreset(preset)}
                      className="flex-shrink-0 font-mono text-[10px] border px-3 py-1.5 rounded ml-3 transition-colors hover:text-white"
                      style={{ borderColor: color, color }}
                    >
                      Vybrať →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:flex flex-col items-center justify-center px-6">
              <div className="flex-1 w-px bg-border" />
              <span className="font-mono text-[9px] text-muted py-3">alebo</span>
              <div className="flex-1 w-px bg-border" />
            </div>
            <div className="flex lg:hidden items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="font-mono text-[9px] text-muted">alebo</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* PATH B — AI generation */}
            <div className="bg-bg2 border border-border rounded-md p-6">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-1">Vlastný koncept</p>
              <p className="text-white font-medium text-sm mb-1">AI Generovanie</p>
              <p className="text-[12px] text-muted2 mb-5">
                Opíš svojho influencera jednou vetou. AI vygeneruje celý profil.
              </p>
              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                rows={5}
                placeholder="Napr: Chcem dark luxury influencerku z Dubaja, ktorá cestuje a miluje módu..."
                className="w-full bg-bg border border-border2 rounded px-3 py-2.5 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none mb-4"
              />
              {error && (
                <p className="font-mono text-[10px] text-red-400 mb-3">{error}</p>
              )}
              <button
                onClick={generateWithAI}
                disabled={loading || !concept.trim()}
                className="w-full font-mono text-[11px] bg-accent text-white py-3 rounded hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                    Claude generuje tvoj charakter...
                  </span>
                ) : (
                  "Generovať s AI →"
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

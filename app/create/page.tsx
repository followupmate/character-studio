"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA, VIKA_VOID, LUNA, MARA } from "@/lib/archetypes";

interface ArchetypeCard {
  preset: CharacterDNA;
  badge?: string;
  accentColor: string;
  description: string;
  styleTags: string[];
  audience: string;
}

const cards: ArchetypeCard[] = [
  {
    preset: VIKA_VOID,
    badge: "RECOMMENDED",
    accentColor: "#4a9eff",
    description:
      "AI cyber muse z post-sovietskeho futuristického sveta. Emotionally intelligent, mysterious, intimately distant.",
    styleTags: ["Cyberpunk", "Berlin Techno", "Brutalism", "Rainy Neon", "Eastern European"],
    audience: "Gen Z, cyberpunk fans, lonely internet culture",
  },
  {
    preset: LUNA,
    accentColor: "#ff9eb5",
    description:
      "Cozy, emotionally supportive AI companion. Warm, parasocial, anime-adjacent energy.",
    styleTags: ["Cozy", "Warm Lighting", "Gamer", "Anime Vibe", "Supportive"],
    audience: "Lonely millennials, gamers, anime fans",
  },
  {
    preset: MARA,
    accentColor: "#c9a84c",
    description:
      "Dark luxury. High fashion power psychology. Elite lifestyle, mysterious and dominant.",
    styleTags: ["Dark Luxury", "High Fashion", "Power", "Elite", "Mysterious"],
    audience: "Ambition-driven, fashion audience, dark feminine",
  },
];

export default function CreatePage() {
  const router = useRouter();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function selectArchetype(preset: CharacterDNA) {
    localStorage.setItem("selected_archetype", JSON.stringify(preset));
    router.push("/create/dna");
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
          <StepProgress current={1} total={8} label="Vyber archetype" />

          {/* Header */}
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-3">
            // Vyber štartovací archetype
          </p>
          <h2 className="text-3xl font-medium text-white mb-2 leading-tight">
            Kto bude tvoj{" "}
            <span className="italic text-muted2">influencer?</span>
          </h2>
          <p className="text-sm text-muted2 mb-10 max-w-xl">
            Vyber predpripravený koncept. Aplikácia automaticky predvyplní celý Character DNA profil.
          </p>

          {/* Archetype cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {cards.map(({ preset, badge, accentColor, description, styleTags, audience }) => {
              const isHovered = hoveredId === preset.id;
              return (
                <div
                  key={preset.id}
                  onMouseEnter={() => setHoveredId(preset.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ borderColor: isHovered ? accentColor : undefined }}
                  className="bg-bg2 border border-border rounded-md p-6 flex flex-col gap-4 transition-all duration-200 cursor-pointer"
                >
                  {/* Top badges row */}
                  <div className="flex items-center justify-between min-h-[20px]">
                    {badge ? (
                      <span
                        style={{ color: accentColor, borderColor: accentColor }}
                        className="font-mono text-[8px] tracking-widest border px-2 py-0.5 rounded-sm bg-transparent"
                      >
                        {badge}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="font-mono text-[8px] text-muted">{preset.archetype}</span>
                  </div>

                  {/* Character name */}
                  <div>
                    <div
                      style={{ color: accentColor }}
                      className="font-mono text-xl font-bold tracking-widest mb-2"
                    >
                      {preset.name}
                    </div>
                    <p className="text-[12.5px] text-muted2 leading-relaxed italic">{description}</p>
                  </div>

                  {/* Style tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {styleTags.map((tag) => (
                      <span
                        key={tag}
                        style={{ borderColor: `${accentColor}40`, color: `${accentColor}cc` }}
                        className="font-mono text-[8px] border px-2 py-0.5 rounded-sm tracking-wide"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Audience */}
                  <div className="flex-1">
                    <p className="font-mono text-[8px] text-muted uppercase tracking-widest mb-1">
                      Audience
                    </p>
                    <p className="text-[11px] text-muted2">{audience}</p>
                  </div>

                  {/* CTA button */}
                  <button
                    onClick={() => selectArchetype(preset)}
                    style={{
                      backgroundColor: isHovered ? accentColor : "transparent",
                      borderColor: accentColor,
                      color: isHovered ? "#080b0f" : accentColor,
                    }}
                    className="w-full font-mono text-[10px] tracking-wider border py-2.5 rounded transition-all duration-200 font-medium"
                  >
                    Vybrať a pokračovať →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

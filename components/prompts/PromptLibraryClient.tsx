"use client";

import { useState } from "react";

interface PromptRow {
  id: string;
  type: "photo" | "video";
  higgsfield_prompt: string;
  status: string;
  created_at: string;
  chs_story_days: {
    location: string;
    mood: string;
    day_number: number;
    chs_characters: { name: string } | null;
  } | null;
}

const typeStyles = {
  photo: { label: "FOTO", border: "border-accent/30", text: "text-accent", bg: "bg-accent/10" },
  video: { label: "VIDEO", border: "border-amber/30", text: "text-amber", bg: "bg-amber/10" },
};

export default function PromptLibraryClient({ prompts }: { prompts: PromptRow[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");

  const filtered = filter === "all" ? prompts : prompts.filter((p) => p.type === filter);

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (prompts.length === 0) {
    return (
      <div className="border border-border border-dashed p-12 text-center">
        <p className="font-display italic text-[28px] text-muted mb-2">Žiadne prompty</p>
        <p className="font-mono text-[10px] text-muted">Vygeneruj príbeh na dashboarde — prompty sa uložia sem.</p>
      </div>
    );
  }

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-px bg-border mb-6 w-fit">
        {(["all", "photo", "video"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] uppercase tracking-[0.08em] px-4 py-2 transition-colors ${
              filter === f
                ? "bg-accent text-white"
                : "bg-surface text-muted hover:text-ink"
            }`}
          >
            {f === "all" ? "Všetko" : f === "photo" ? "Foto" : "Video"}
          </button>
        ))}
      </div>

      {/* Prompt grid */}
      <div className="space-y-px">
        {filtered.map((p) => {
          const style = typeStyles[p.type];
          const charName = p.chs_story_days?.chs_characters?.name ?? "Unknown";
          const day = p.chs_story_days?.day_number;
          const location = p.chs_story_days?.location;
          const mood = p.chs_story_days?.mood;

          return (
            <div key={p.id} className="bg-surface border border-border hover:border-border2 transition-colors">
              {/* Header */}
              <div className="bg-surface-low border-b border-border px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-[8px] border px-2 py-0.5 tracking-[0.1em] ${style.border} ${style.text} ${style.bg}`}>
                    {style.label}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink font-medium">
                    {charName}
                  </span>
                  {day && (
                    <span className="font-mono text-[9px] text-muted">DAY {day}</span>
                  )}
                  {location && (
                    <span className="font-mono text-[9px] text-muted hidden sm:inline">
                      <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">location_on</span>
                      {location}
                    </span>
                  )}
                  {mood && (
                    <span className="font-mono text-[9px] text-muted hidden md:inline">· {mood}</span>
                  )}
                </div>
                <button
                  onClick={() => copy(p.id, p.higgsfield_prompt)}
                  className={`font-mono text-[9px] uppercase tracking-[0.08em] border px-3 py-1 transition-colors ${
                    copied === p.id
                      ? "border-teal/30 text-teal bg-teal/10"
                      : "border-border text-muted hover:text-ink hover:border-border2"
                  }`}
                >
                  {copied === p.id ? "✓ Skopírované" : "Kopírovať"}
                </button>
              </div>

              {/* Prompt body */}
              <pre className="px-4 py-3 font-mono text-[10px] text-muted2 leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {p.higgsfield_prompt}
              </pre>
            </div>
          );
        })}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";

interface PromptRow {
  id: string;
  type: "photo" | "video";
  higgsfield_prompt: string;
  status: string;
  created_at: string;
  prompt_doctrine: string | null;
  visual_tone_used: string | null;
  styling_note_used: string | null;
  chs_story_days: {
    location: string;
    mood: string;
    day_number: number;
    character_id: string;
    chs_characters: { name: string; id: string } | null;
  } | null;
}

const typeStyles = {
  photo: { label: "FOTO", border: "border-accent/30", text: "text-accent", bg: "bg-accent/10" },
  video: { label: "VIDEO", border: "border-amber/30", text: "text-amber", bg: "bg-amber/10" },
};

const doctrineStyles: Record<string, { label: string; color: string }> = {
  cinematic: { label: "CINEMATIC", color: "text-violet-400 border-violet-400/30 bg-violet-400/10" },
  instagram: { label: "INSTAGRAM", color: "text-pink-400 border-pink-400/30 bg-pink-400/10" },
  deepseek: { label: "DEEPSEEK", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  editorial: { label: "EDITORIAL", color: "text-amber border-amber/30 bg-amber/10" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("sk-SK", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PromptLibraryClient({ prompts: initialPrompts }: { prompts: PromptRow[] }) {
  const [prompts, setPrompts] = useState<PromptRow[]>(initialPrompts);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [expandedMeta, setExpandedMeta] = useState<string | null>(null);

  const filtered = filter === "all" ? prompts : prompts.filter((p) => p.type === filter);

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function deletePrompt(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/characters/prompts?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch {}
    setDeleting(null);
  }

  async function clearAll() {
    setClearingAll(true);
    try {
      const res = await fetch("/api/characters/prompts?clear=all", { method: "DELETE" });
      if (!res.ok) throw new Error("Clear failed");
      setPrompts([]);
    } catch {}
    setClearingAll(false);
    setConfirmClearAll(false);
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
      {/* Filter + Clear all toolbar */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex gap-px bg-border w-fit">
          {(["all", "photo", "video"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-mono text-[10px] uppercase tracking-[0.08em] px-4 py-2 transition-colors ${
                filter === f ? "bg-accent text-white" : "bg-surface text-muted hover:text-ink"
              }`}
            >
              {f === "all" ? `Všetko (${prompts.length})` : f === "photo" ? `Foto (${prompts.filter(p => p.type === "photo").length})` : `Video (${prompts.filter(p => p.type === "video").length})`}
            </button>
          ))}
        </div>

        {confirmClearAll ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-red-400">Zmazať všetky prompty?</span>
            <button
              onClick={clearAll}
              disabled={clearingAll}
              className="font-mono text-[9px] uppercase px-3 py-1.5 border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
            >
              {clearingAll ? "Mažem…" : "Potvrdiť"}
            </button>
            <button
              onClick={() => setConfirmClearAll(false)}
              className="font-mono text-[9px] uppercase px-3 py-1.5 border border-border text-muted hover:text-ink transition-colors"
            >
              Zrušiť
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClearAll(true)}
            className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] px-3 py-1.5 border border-red-400/20 text-red-400/60 hover:border-red-400/50 hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-[13px]">delete_sweep</span>
            Zmazať históriu
          </button>
        )}
      </div>

      {/* Prompt list */}
      <div className="space-y-px">
        {filtered.map((p) => {
          const style = typeStyles[p.type];
          const docStyle = p.prompt_doctrine ? doctrineStyles[p.prompt_doctrine] : null;
          const charName = p.chs_story_days?.chs_characters?.name ?? "Unknown";
          const day = p.chs_story_days?.day_number;
          const location = p.chs_story_days?.location;
          const mood = p.chs_story_days?.mood;
          const isDeleting = deleting === p.id;
          const hasMetaDetail = !!(p.visual_tone_used || p.styling_note_used);
          const metaExpanded = expandedMeta === p.id;

          return (
            <div
              key={p.id}
              className={`bg-surface border border-border hover:border-border2 transition-all ${isDeleting ? "opacity-40" : ""}`}
            >
              {/* Header */}
              <div className="bg-surface-low border-b border-border px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-mono text-[8px] border px-2 py-0.5 tracking-[0.1em] ${style.border} ${style.text} ${style.bg}`}>
                    {style.label}
                  </span>
                  {docStyle && (
                    <span className={`font-mono text-[8px] border px-2 py-0.5 tracking-[0.1em] ${docStyle.color}`}>
                      {docStyle.label}
                    </span>
                  )}
                  <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink font-medium">
                    {charName}
                  </span>
                  {day && <span className="font-mono text-[9px] text-muted">DAY {day}</span>}
                  {location && (
                    <span className="font-mono text-[9px] text-muted hidden sm:inline">
                      <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">location_on</span>
                      {location}
                    </span>
                  )}
                  {mood && (
                    <span className="font-mono text-[9px] text-muted hidden md:inline">· {mood}</span>
                  )}
                  <span className="font-mono text-[8px] text-muted/50 hidden lg:inline">
                    {formatDate(p.created_at)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {hasMetaDetail && (
                    <button
                      onClick={() => setExpandedMeta(metaExpanded ? null : p.id)}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] border px-2 py-1 border-border text-muted hover:text-ink hover:border-border2 transition-colors"
                      title="Zobraziť metadata"
                    >
                      <span className="material-symbols-outlined text-[12px]">info</span>
                    </button>
                  )}
                  <button
                    onClick={() => copy(p.id, p.higgsfield_prompt)}
                    className={`font-mono text-[9px] uppercase tracking-[0.08em] border px-3 py-1 transition-colors ${
                      copied === p.id
                        ? "border-teal/30 text-teal bg-teal/10"
                        : "border-border text-muted hover:text-ink hover:border-border2"
                    }`}
                  >
                    {copied === p.id ? "✓ OK" : "Kopírovať"}
                  </button>
                  <button
                    onClick={() => deletePrompt(p.id)}
                    disabled={isDeleting}
                    className="font-mono text-[9px] border px-2 py-1 border-red-400/20 text-red-400/50 hover:border-red-400/50 hover:text-red-400 transition-colors disabled:opacity-30"
                    title="Zmazať"
                  >
                    <span className="material-symbols-outlined text-[13px]">delete</span>
                  </button>
                </div>
              </div>

              {/* Metadata detail (expanded) */}
              {metaExpanded && hasMetaDetail && (
                <div className="border-b border-border px-4 py-2 bg-surface-low/50 space-y-1">
                  {p.visual_tone_used && (
                    <div className="flex gap-2">
                      <span className="font-mono text-[8px] text-muted uppercase tracking-widest w-24 flex-shrink-0">Visual Tone</span>
                      <span className="font-mono text-[9px] text-muted2 line-clamp-2">{p.visual_tone_used}</span>
                    </div>
                  )}
                  {p.styling_note_used && (
                    <div className="flex gap-2">
                      <span className="font-mono text-[8px] text-muted uppercase tracking-widest w-24 flex-shrink-0">Styling</span>
                      <span className="font-mono text-[9px] text-muted2 line-clamp-2">{p.styling_note_used}</span>
                    </div>
                  )}
                </div>
              )}

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

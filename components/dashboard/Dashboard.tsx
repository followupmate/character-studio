"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Character, StoryDay, Media } from "@/types";

interface Props {
  characters: Character[];
  todayStories: (StoryDay & { chs_media: Media[] })[];
  photoMap: Record<string, string>;
}

function uptimeHours(createdAt: string): string {
  const h = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  return h.toLocaleString("sk-SK") + "H";
}

function charType(platforms: string[]): string {
  if (platforms.includes("youtube") && platforms.includes("instagram")) return "MULTI_PLATFORM";
  if (platforms.includes("youtube")) return "VIDEO_ARCH";
  if (platforms.includes("tiktok")) return "SHORT_FORM";
  return "CONTENT_LEAD";
}

function CharacterCard({
  char,
  photoUrl,
  onDelete,
  deletingId,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  char: Character;
  photoUrl?: string;
  onDelete: (id: string) => void;
  deletingId: string | null;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="bg-surface border border-border hover:border-border2 transition-colors flex flex-col group">
      {/* Portrait image */}
      <div className="relative overflow-hidden bg-surface-low" style={{ aspectRatio: "3/4" }}>
        {photoUrl && !imgErr ? (
          <img
            src={photoUrl}
            alt={char.name}
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-105"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[48px] text-muted/30">person</span>
          </div>
        )}
        {/* Active badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className={`font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border flex items-center gap-1.5 ${
            char.is_active
              ? "bg-teal/10 border-teal/30 text-teal"
              : "bg-surface/80 border-border text-muted"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${char.is_active ? "bg-teal animate-pulse" : "bg-muted"}`} />
            {char.is_active ? "ACTIVE" : "PAUSED"}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="font-display italic text-[22px] leading-none text-white mb-1.5">{char.name}</div>
          <p className="font-mono text-[9px] text-muted2 leading-relaxed line-clamp-2">
            {char.visual_brief || char.backstory}
          </p>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-auto pt-3 border-t border-border">
          <div>
            <div className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase mb-0.5">Type</div>
            <div className="font-mono text-[9px] text-ink">{charType(char.platforms)}</div>
          </div>
          <div>
            <div className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase mb-0.5">Uptime</div>
            <div className="font-mono text-[9px] text-ink">{uptimeHours(char.created_at)}</div>
          </div>
        </div>

        {/* Delete */}
        <div className="border-t border-border pt-2">
          {confirmDeleteId === char.id ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[9px] text-red-400">Vymazať?</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="font-mono text-[8px] uppercase border border-border px-2 py-0.5 text-muted hover:text-ink transition-colors"
                >Nie</button>
                <button
                  onClick={() => onDelete(char.id)}
                  disabled={deletingId === char.id}
                  className="font-mono text-[8px] uppercase border border-red-500/40 px-2 py-0.5 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {deletingId === char.id ? "..." : "Áno"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteId(char.id)}
              className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[11px]">delete</span>
              Vymazať
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ characters, todayStories, photoMap }: Props) {
  const router = useRouter();
  const activeChars = characters.filter((c) => c.is_active);
  const totalMedia = todayStories.flatMap((s) => s.chs_media);
  const postedMedia = totalMedia.filter((m) => m.status === "posted");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function triggerStory() {
    setIsGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/characters/story");
      if (res.ok) {
        setGenResult({ ok: true, msg: "Príbeh vygenerovaný! Stránka sa aktualizuje..." });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setGenResult({ ok: false, msg: data.error ?? `Chyba ${res.status}` });
        setIsGenerating(false);
      }
    } catch (err) {
      setGenResult({ ok: false, msg: err instanceof Error ? err.message : "Sieťová chyba" });
      setIsGenerating(false);
    }
    setTimeout(() => setGenResult(null), 4000);
  }

  async function deleteCharacter(characterId: string) {
    setDeletingId(characterId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch("/api/characters/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setGenResult({ ok: false, msg: data.error ?? "Chyba pri mazaní" });
        setTimeout(() => setGenResult(null), 4000);
      }
    } catch {
      setGenResult({ ok: false, msg: "Sieťová chyba" });
      setTimeout(() => setGenResult(null), 4000);
    }
    setDeletingId(null);
  }

  const quickActions = [
    {
      icon: "auto_awesome",
      label: "Generuj príbeh",
      desc: "Nový príbeh pre všetky charaktery",
      onClick: triggerStory,
      disabled: isGenerating,
    },
    {
      icon: "add_circle",
      label: "Nový charakter",
      desc: "Vytvor nový AI profil",
      onClick: () => router.push("/create"),
      disabled: false,
    },
    {
      icon: "open_in_new",
      label: "Otvoriť Higgsfield",
      desc: "Generuj foto a video",
      onClick: () => window.open("https://higgsfield.ai", "_blank"),
      disabled: false,
    },
    {
      icon: "library_books",
      label: "Prompt knižnica",
      desc: "Všetky Higgsfield prompty",
      onClick: () => router.push("/prompts"),
      disabled: false,
    },
  ];

  return (
    <div className="relative">
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
        <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
            systém aktívny
          </span>
        </div>
      </div>

      {/* Banner */}
      {genResult && (
        <div className={`px-8 py-2.5 font-mono text-[11px] border-b ${genResult.ok ? "bg-teal/5 border-teal/20 text-teal" : "bg-red-900/10 border-red-500/20 text-red-400"}`}>
          {genResult.msg}
        </div>
      )}

      <div className="p-4 lg:p-8">
        {/* Heading */}
        <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">// Prehľad</p>
        <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-6">
          Character Studio
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border mb-8">
          {[
            { label: "Charaktery",   value: characters.length,   sub: `${activeChars.length} aktívnych` },
            { label: "Dnešné posty", value: postedMedia.length,  sub: `z ${totalMedia.length} médií` },
            { label: "Príbehy dnes", value: todayStories.length, sub: "vygenerovaných" },
            { label: "Platformy",    value: 2,                   sub: "IG + YouTube" },
          ].map((s) => (
            <div key={s.label} className="bg-surface p-5">
              <div className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">{s.label}</div>
              <div className="font-display text-[40px] leading-none text-white mb-1">{s.value}</div>
              <div className="font-mono text-[10px] text-muted">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-3">// Quick Actions</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className="bg-surface p-4 flex flex-col gap-3 text-left hover:bg-surface-low border border-transparent hover:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <span className="material-symbols-outlined text-[20px] text-muted group-hover:text-accent transition-colors">
                  {action.icon}
                </span>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink mb-0.5">
                    {action.label}
                  </div>
                  <div className="font-mono text-[9px] text-muted">{action.desc}</div>
                </div>
                <span className="material-symbols-outlined text-[14px] text-muted self-end group-hover:text-accent transition-colors">
                  arrow_forward
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Character Library */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">// Character Library</p>
            <a href="/characters" className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent hover:text-white transition-colors">
              View All →
            </a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border">
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                char={char}
                photoUrl={photoMap[char.id]}
                onDelete={deleteCharacter}
                deletingId={deletingId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
              />
            ))}
            <button
              onClick={() => router.push("/create")}
              className="bg-surface border border-border border-dashed flex flex-col items-center justify-center gap-2 hover:border-teal/40 hover:bg-surface-low transition-colors p-4"
              style={{ minHeight: "260px" }}
            >
              <span className="material-symbols-outlined text-[24px] text-muted">add</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Nový charakter</span>
            </button>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={triggerStory}
        disabled={isGenerating}
        className="fixed bottom-6 right-6 z-50 bg-accent text-white px-5 py-3 font-mono text-[10px] uppercase tracking-[0.1em] flex items-center gap-2 hover:bg-blue-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        {isGenerating ? "Generujem..." : "Quick Generate"}
      </button>
    </div>
  );
}

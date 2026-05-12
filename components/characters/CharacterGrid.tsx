"use client";

import { useState } from "react";
import { Character } from "@/types";

interface Props {
  characters: Character[];
  activeCount: number;
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

export default function CharacterGrid({ characters, activeCount, photoMap }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteCharacter(characterId: string) {
    setDeletingId(characterId);
    setConfirmDeleteId(null);
    setError(null);
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
        setError(data.error ?? "Chyba pri mazaní");
        setTimeout(() => setError(null), 4000);
      }
    } catch {
      setError("Sieťová chyba");
      setTimeout(() => setError(null), 4000);
    }
    setDeletingId(null);
  }

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-2.5 font-mono text-[11px] bg-red-900/10 border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-border mb-px">
        {characters.map((char) => (
          <CharCard
            key={char.id}
            char={char}
            photoUrl={photoMap[char.id]}
            deletingId={deletingId}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            onDelete={deleteCharacter}
          />
        ))}

        <a
          href="/create"
          className="bg-surface border border-border border-dashed flex flex-col items-center justify-center gap-3 hover:border-teal/40 hover:bg-surface-low transition-colors p-5 min-h-[260px]"
        >
          <span className="material-symbols-outlined text-[28px] text-muted">add_circle</span>
          <div className="text-center">
            <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Nový charakter</div>
            <div className="font-mono text-[8px] text-muted/60 mt-1">→ /create</div>
          </div>
        </a>
      </div>

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
    </>
  );
}

function CharCard({
  char,
  photoUrl,
  deletingId,
  confirmDeleteId,
  setConfirmDeleteId,
  onDelete,
}: {
  char: Character;
  photoUrl?: string;
  deletingId: string | null;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="bg-surface border border-border hover:border-border2 transition-colors flex flex-col group">
      {/* Portrait */}
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
              <span className="font-mono text-[9px] text-red-400">Naozaj vymazať?</span>
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
                  {deletingId === char.id ? "Mažem..." : "Vymazať"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDeleteId(char.id)}
              className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[11px]">delete</span>
              Vymazať charakter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Character } from "@/types";
import SoulIdStatus from "@/components/dashboard/SoulIdStatus";

interface Props {
  characters: Character[];
  activeCount: number;
}

export default function CharacterGrid({ characters, activeCount }: Props) {
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border mb-px">
        {characters.map((char) => (
          <div key={char.id} className="bg-surface p-5 flex flex-col gap-3 hover:bg-surface-low transition-colors group relative">
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

            {/* Delete controls */}
            <div className="mt-auto pt-2 border-t border-border">
              {confirmDeleteId === char.id ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] text-red-400">Naozaj vymazať?</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="font-mono text-[8px] uppercase tracking-[0.05em] border border-border px-2 py-0.5 text-muted hover:text-ink transition-colors"
                    >
                      Nie
                    </button>
                    <button
                      onClick={() => deleteCharacter(char.id)}
                      disabled={deletingId === char.id}
                      className="font-mono text-[8px] uppercase tracking-[0.05em] border border-red-500/40 px-2 py-0.5 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
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
    </>
  );
}

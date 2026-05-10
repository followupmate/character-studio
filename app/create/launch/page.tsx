"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";

const POSTING_TIMES = [
  "06:00", "07:00", "08:00", "09:00", "10:00",
  "11:00", "12:00", "18:00", "19:00", "20:00", "21:00",
];

function downloadJson(dna: CharacterDNA) {
  const blob = new Blob([JSON.stringify(dna, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dna.name.replace(/\s+/g, "_")}_DNA.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LaunchPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [postingTime, setPostingTime] = useState("10:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
    } catch {}
  }, []);

  async function launch() {
    if (!dna) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dna, posting_time: postingTime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Neznáma chyba");
      setLaunched(true);
      localStorage.removeItem("character_dna");
      localStorage.removeItem("selected_archetype");
      localStorage.removeItem("create_method");
      setTimeout(() => router.push("/characters"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznáma chyba");
      setLoading(false);
    }
  }

  if (!dna) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 lg:ml-56 p-8">
          <div className="bg-bg2 border border-border border-dashed rounded-md p-8 text-center max-w-lg">
            <p className="text-white font-medium mb-2">Chýba Character DNA</p>
            <p className="text-sm text-muted mb-4">Najprv vyplň DNA profil.</p>
            <button
              onClick={() => router.push("/create")}
              className="font-mono text-[10px] bg-accent text-white px-4 py-2 rounded hover:bg-blue-400 transition-colors"
            >
              → Začať
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Spustiť charakter</h1>
        </div>

        <div className="p-4 lg:p-8 max-w-2xl">
          <StepProgress current={5} total={5} label="Spustiť charakter" />

          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Finálny krok</p>
          <h2 className="text-2xl font-medium text-white mb-1">{dna.name}</h2>
          <p className="text-sm text-muted2 mb-8">
            Skontroluj súhrn a spusti charakter do produkcie.
          </p>

          {/* Summary card */}
          <div className="bg-bg2 border border-border rounded-md p-5 mb-6 space-y-4">
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest">// Súhrn DNA</p>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Meno</span>
                <span className="text-white font-medium">{dna.name}</span>
              </div>
              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Archetype</span>
                <span className="text-ink">{dna.archetype || "—"}</span>
              </div>

              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Soul ID</span>
                {dna.soul_id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0" />
                    <span className="font-mono text-[10px] text-teal">{dna.soul_id.slice(0, 8)}...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
                    <span className="font-mono text-[10px] text-amber">chýba</span>
                  </div>
                )}
              </div>

              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Niche</span>
                <span className="text-ink text-[11px]">{dna.identity.niche || "—"}</span>
              </div>

              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Platformy</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {dna.content.platforms.length ? dna.content.platforms.map((p) => (
                    <span key={p} className="font-mono text-[8px] border border-accent/30 text-accent px-1.5 py-0.5 rounded-sm">{p}</span>
                  )) : <span className="text-muted text-[11px]">—</span>}
                </div>
              </div>

              <div>
                <span className="font-mono text-[9px] text-muted block mb-0.5">Content pillars</span>
                <span className="text-ink text-[11px]">{dna.content.pillars.slice(0, 3).join(", ") || "—"}</span>
              </div>
            </div>

            {dna.midjourneyPrompt && (
              <div className="pt-3 border-t border-border">
                <span className="font-mono text-[9px] text-muted block mb-1.5">Midjourney prompt</span>
                <p className="font-mono text-[10px] text-teal leading-relaxed line-clamp-2 break-words">{dna.midjourneyPrompt}</p>
              </div>
            )}

            {dna.lore?.backstory && (
              <div className="pt-3 border-t border-border">
                <span className="font-mono text-[9px] text-muted block mb-1.5">Lore — backstory</span>
                <p className="text-[11px] text-muted2 italic leading-relaxed line-clamp-1">{dna.lore.backstory}</p>
              </div>
            )}
          </div>

          {/* Posting time */}
          <div className="bg-bg2 border border-border rounded-md p-5 mb-6">
            <label className="block font-mono text-[9px] text-muted uppercase tracking-widest mb-3">
              Čas denného postingu
            </label>
            <select
              value={postingTime}
              onChange={(e) => setPostingTime(e.target.value)}
              className="bg-bg border border-border2 rounded px-3 py-2 font-mono text-[11px] text-ink focus:outline-none focus:border-accent transition-colors"
            >
              {POSTING_TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Success banner */}
          {launched && (
            <div className="bg-teal/10 border border-teal/30 rounded-md px-4 py-4 mb-4 text-center">
              <p className="font-mono text-[12px] text-teal font-medium">🎉 {dna.name} je živý! Presmerovávam...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-md px-4 py-3 mb-4">
              <p className="font-mono text-[11px] text-red-400">{error}</p>
            </div>
          )}

          {/* Launch button */}
          <button
            onClick={launch}
            disabled={loading}
            className="w-full font-mono text-[12px] font-medium bg-accent text-white px-6 py-4 rounded hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {loading ? "Spúšťam..." : "Spustiť charakter →"}
          </button>

          {/* Bottom nav */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <button
              onClick={() => router.push("/create/soul")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button
              onClick={() => dna && downloadJson(dna)}
              className="font-mono text-[11px] bg-teal/10 border border-teal/30 text-teal px-5 py-2.5 rounded hover:bg-teal/20 transition-colors"
            >
              Exportovať JSON
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

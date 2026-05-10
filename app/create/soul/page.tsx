"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";

const CLI_COMMANDS = "higgsfield auth login\nhiggsfield soul-id list";

export default function SoulPage() {
  const router = useRouter();
  const [soulId, setSoulId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) {
        const dna = JSON.parse(raw);
        if (dna.soul_id) {
          setSoulId(dna.soul_id);
          setInput(dna.soul_id);
        }
      }
    } catch {}
  }, []);

  async function copyCli() {
    await navigator.clipboard.writeText(CLI_COMMANDS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function saveSoulId() {
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      const raw = localStorage.getItem("character_dna");
      const dna = raw ? JSON.parse(raw) : {};
      const updated = { ...dna, soul_id: trimmed };
      localStorage.setItem("character_dna", JSON.stringify(updated));
      setSoulId(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Soul ID Setup</h1>
        </div>

        <div className="p-4 lg:p-8 max-w-4xl">
          <StepProgress current={3} total={8} label="Soul ID" />

          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Visual Identity</p>
          <h2 className="text-2xl font-medium text-white mb-1">
            Konzistentná <span className="italic text-muted2">tvár</span>
          </h2>
          <p className="text-sm text-muted2 mb-8 max-w-xl">
            Soul ID zabezpečuje že tvoj charakter vyzerá rovnako naprieč všetkými generovaniami. Vytvor ho raz, používaj navždy.
          </p>

          {/* Status banner */}
          <div className={`flex items-center gap-2 mb-8 px-4 py-3 rounded-md border ${soulId ? "bg-teal/5 border-teal/20" : "bg-amber/5 border-amber/20"}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${soulId ? "bg-teal" : "bg-amber"}`} />
            {soulId ? (
              <span className="font-mono text-[10px] text-teal">
                Soul ID aktívny ✓ — <span className="text-ink">{soulId.slice(0, 8)}...{soulId.slice(-4)}</span>
              </span>
            ) : (
              <span className="font-mono text-[10px] text-amber">
                Soul ID chýba — charakter bude fungovať aj bez neho, ale tvár nebude konzistentná
              </span>
            )}
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Krok 1 */}
            <div className="bg-bg2 border border-border rounded-md p-5">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-3">
                Krok 1: Vytvor Soul v Higgsfield
              </p>
              <p className="text-[12px] text-muted2 leading-relaxed mb-4">
                Nahraj 15–20 fotiek charakteru. Higgsfield natrénuje konzistentnú tvár za 5–10 minút.
              </p>
              <a
                href="https://higgsfield.ai/character"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[10px] bg-amber/10 border border-amber/30 text-amber px-4 py-2 rounded hover:bg-amber/20 transition-colors mb-4"
              >
                Otvoriť Higgsfield Soul →
              </a>
              <ul className="space-y-2">
                {[
                  "Použi fotky z rôznych uhlov",
                  "Dobré osvetlenie = lepší výsledok",
                  "15–20 fotiek je optimum",
                ].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted2">
                    <span className="text-accent mt-0.5">◦</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Krok 2 */}
            <div className="bg-bg2 border border-border rounded-md p-5">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-3">
                Krok 2: Vlož Soul ID
              </p>
              <p className="text-[12px] text-muted2 leading-relaxed mb-2">
                Po dokončení trénovania spusti v termináli:
              </p>

              <div className="relative mb-3">
                <pre className="bg-[#050709] border border-border rounded px-4 py-3 font-mono text-[11px] text-teal leading-relaxed pr-20">
                  {CLI_COMMANDS}
                </pre>
                <button
                  type="button"
                  onClick={copyCli}
                  className="absolute top-2 right-2 font-mono text-[8px] bg-bg2 border border-border text-muted2 px-2 py-1 rounded hover:text-ink hover:border-border2 transition-colors"
                >
                  {copied ? "✓" : "Kopírovať"}
                </button>
              </div>

              <p className="text-[11px] text-muted mb-3">
                Skopíruj ID svojho charakteru zo stĺpca ID
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveSoulId()}
                  placeholder="fb42bf59-4397-4ac9-bf60-..."
                  className="flex-1 min-w-0 bg-bg3 border border-border2 rounded px-3 py-2 font-mono text-[10px] text-ink placeholder:text-muted focus:outline-none focus:border-teal transition-colors"
                />
                <button
                  type="button"
                  onClick={saveSoulId}
                  disabled={!input.trim()}
                  className="flex-shrink-0 font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-3 py-2 rounded hover:bg-teal/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {saved ? "✓ Uložené" : "Uložiť Soul ID"}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="flex items-center gap-3 pt-6 border-t border-border">
            <button
              onClick={() => router.push("/create/dna")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button
              onClick={() => router.push("/create/prompts")}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors"
            >
              Pokračovať →
            </button>
            {!soulId && (
              <span className="font-mono text-[9px] text-muted">
                Soul ID nie je povinný
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

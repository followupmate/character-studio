"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";
import { viralLoreHooks } from "@/lib/content-data";

interface LoreFields {
  backstory: string;
  secret: string;
  obsession: string;
  fear: string;
  goal: string;
  relationshipPattern: string;
  worldview: string;
  signatureQuote: string;
}

const emptyLore: LoreFields = {
  backstory: "", secret: "", obsession: "", fear: "",
  goal: "", relationshipPattern: "", worldview: "", signatureQuote: "",
};

function loreFromDna(dna: CharacterDNA): LoreFields {
  return {
    backstory: dna.identity.origin,
    secret: "",
    obsession: dna.personality.traits.slice(0, 3).join(", "),
    fear: "",
    goal: dna.content.monetization.slice(0, 2).join(", "),
    relationshipPattern: dna.personality.relationshipStyle,
    worldview: dna.personality.worldview,
    signatureQuote: dna.personality.signaturePhrases[0] ?? "",
  };
}

function Textarea({
  label, value, onChange, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <label className="block font-mono text-[9px] text-muted uppercase tracking-widest mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-bg border border-border2 rounded px-3 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none"
      />
    </div>
  );
}

export default function LorePage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [lore, setLore] = useState<LoreFields>(emptyLore);
  const [saved, setSaved] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedHook, setCopiedHook] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) {
        const parsed = JSON.parse(raw) as CharacterDNA;
        setDna(parsed);
        const savedLore = localStorage.getItem("character_lore");
        setLore(savedLore ? JSON.parse(savedLore) : loreFromDna(parsed));
      }
    } catch {}
  }, []);

  function set(k: keyof LoreFields, v: string) {
    setLore((l) => ({ ...l, [k]: v }));
  }

  function saveLore() {
    localStorage.setItem("character_lore", JSON.stringify(lore));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function copy(text: string, idx: number, type: "phrase" | "hook") {
    await navigator.clipboard.writeText(text);
    if (type === "phrase") { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); }
    else { setCopiedHook(idx); setTimeout(() => setCopiedHook(null), 2000); }
  }

  const hooks = dna ? (viralLoreHooks[dna.id] ?? []) : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Lore Engine</h1>
          <div className="flex gap-2">
            <button onClick={saveLore}
              className="font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-3 py-1.5 rounded hover:bg-teal/20 transition-colors">
              {saved ? "✓ Uložené" : "Uložiť lore"}
            </button>
            <button onClick={() => { saveLore(); router.push("/create/content"); }}
              className="font-mono text-[10px] bg-accent text-white px-3 py-1.5 rounded hover:bg-blue-400 transition-colors">
              Pokračovať → Content Engine
            </button>
          </div>
        </div>

        <div className="p-4 lg:p-8">
          <StepProgress current={5} total={8} label="Lore Engine" />
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Lore Engine</p>
          <h2 className="text-2xl font-medium text-white mb-8">
            Príbeh za{" "}
            <span className="italic text-muted2">osobnosťou</span>
          </h2>

          <div className="grid grid-cols-5 gap-6">
            {/* Left — editable lore fields */}
            <div className="col-span-3 space-y-4">
              <Textarea label="Backstory" value={lore.backstory} onChange={(v) => set("backstory", v)} rows={4} />
              <Textarea label="Secret" value={lore.secret} onChange={(v) => set("secret", v)} />
              <Textarea label="Obsession" value={lore.obsession} onChange={(v) => set("obsession", v)} />
              <Textarea label="Fear" value={lore.fear} onChange={(v) => set("fear", v)} />
              <Textarea label="Goal" value={lore.goal} onChange={(v) => set("goal", v)} />
              <Textarea label="Relationship pattern" value={lore.relationshipPattern} onChange={(v) => set("relationshipPattern", v)} />
              <Textarea label="Worldview" value={lore.worldview} onChange={(v) => set("worldview", v)} />
              <Textarea label="Signature quote" value={lore.signatureQuote} onChange={(v) => set("signatureQuote", v)} />
            </div>

            {/* Right — phrases + hooks */}
            <div className="col-span-2 space-y-6">
              {/* Signature Phrases */}
              <div>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-3">// Signature Phrases</p>
                {dna?.personality.signaturePhrases.length ? (
                  <div className="space-y-2">
                    {dna.personality.signaturePhrases.map((phrase, i) => (
                      <div key={i} className="bg-bg2 border border-border rounded-md px-4 py-3 flex items-start justify-between gap-3">
                        <p className="font-mono text-[11px] text-ink italic flex-1 leading-relaxed">&quot;{phrase}&quot;</p>
                        <button
                          onClick={() => copy(phrase, i, "phrase")}
                          className="flex-shrink-0 font-mono text-[8px] border border-border2 text-muted2 px-2 py-0.5 rounded hover:text-ink hover:border-border transition-colors"
                        >
                          {copiedIdx === i ? "✓" : "Kopírovať"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-muted italic">Vyplň Character DNA pre zobrazenie fráz.</p>
                )}
              </div>

              {/* Viral Lore Hooks */}
              {hooks.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-1">// Viral Lore Hooks</p>
                  <p className="text-[11px] text-muted2 mb-3">Použiteľné ako bio, caption alebo pinned post.</p>
                  <div className="space-y-2">
                    {hooks.map((hook, i) => (
                      <div key={i} className="bg-bg3 border border-border rounded-md px-4 py-3 flex items-start justify-between gap-3">
                        <p className="text-[11.5px] text-ink flex-1 leading-relaxed">{hook}</p>
                        <button
                          onClick={() => copy(hook, i, "hook")}
                          className="flex-shrink-0 font-mono text-[8px] border border-border2 text-muted2 px-2 py-0.5 rounded hover:text-ink hover:border-border transition-colors"
                        >
                          {copiedHook === i ? "✓" : "Kopírovať"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom actions */}
          <div className="mt-8 pt-6 border-t border-border flex items-center gap-3">
            <button
              onClick={() => router.push("/create/prompts")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button onClick={() => { saveLore(); router.push("/create/content"); }}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors">
              Pokračovať →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

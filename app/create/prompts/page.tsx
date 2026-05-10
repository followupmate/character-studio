"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";

const SCENES = [
  { label: "First Identity Portrait", env: "standing against neutral dark background, direct gaze into camera, identity portrait" },
  { label: "Apartment Scene",          env: "brutalist apartment interior, rainy window reflections, intimate indoor lighting" },
  { label: "Instagram Mirror Selfie",  env: "holding phone, mirror reflection, modern bathroom or bedroom, social media realism" },
  { label: "Tokyo Night Walk",         env: "walking through neon tokyo streets at night, cinematic rain, reflective wet streets" },
  { label: "Techno Club Shot",         env: "underground techno club, dramatic strobe lighting, crowd background blur" },
  { label: "Luxury Editorial",         env: "luxury penthouse interior, golden hour window light, high fashion magazine shot" },
];

const LOCK_ITEMS = [
  { key: "face",    label: "Face structure locked",   getValue: (d: CharacterDNA) => d.visual.faceStructure },
  { key: "hair",    label: "Hair locked",             getValue: (d: CharacterDNA) => d.visual.hair },
  { key: "eyes",    label: "Eye vibe locked",         getValue: (d: CharacterDNA) => d.visual.faceStructure.split(",")[0] },
  { key: "skin",    label: "Skin tone locked",        getValue: (d: CharacterDNA) => d.visual.skinTone },
  { key: "fashion", label: "Fashion palette locked",  getValue: (d: CharacterDNA) => d.visual.fashionStyle },
  { key: "camera",  label: "Camera style locked",     getValue: (d: CharacterDNA) => d.promptSettings.camera },
  { key: "lighting",label: "Lighting mood locked",    getValue: (d: CharacterDNA) => d.promptSettings.lighting },
];

function buildPrompt(dna: CharacterDNA, scene: typeof SCENES[0]): string {
  return [
    dna.name,
    dna.visual.ethnicityLook,
    dna.visual.hair,
    dna.visual.skinTone,
    dna.visual.faceStructure,
    dna.visual.fashionStyle,
    scene.env,
    dna.visual.colorPalette.join(", "),
    dna.personality.emotionalTone,
    "realistic skin pores, high fashion editorial photography",
    dna.promptSettings.lighting,
    "shallow depth of field, analog film grain",
    dna.promptSettings.camera,
    `ultra detailed --ar ${dna.promptSettings.aspectRatio} --stylize ${dna.promptSettings.stylize} --v ${dna.promptSettings.version}`,
  ].filter(Boolean).join(", ");
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${on ? "bg-teal" : "bg-border2"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

const emptyDna: CharacterDNA = {
  id: "", name: "", archetype: "",
  identity: { ageAppearance: "", origin: "", niche: "" },
  visual: { ethnicityLook: "", hair: "", skinTone: "", faceStructure: "", bodyType: "", fashionStyle: "", colorPalette: [], accessories: [] },
  personality: { traits: [], emotionalTone: "", voiceStyle: "", humorStyle: "", relationshipStyle: "", worldview: "", signaturePhrases: [] },
  content: { platforms: [], pillars: [], targetAudience: "", postingVibe: "", monetization: [] },
  promptSettings: { aspectRatio: "4:5", stylize: 300, version: "7", camera: "", lighting: "" },
};

export default function PromptsPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA>(emptyDna);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
      const savedLocks = localStorage.getItem("consistency_lock");
      if (savedLocks) setLocks(JSON.parse(savedLocks));
    } catch {}
  }, []);

  function toggleLock(key: string) {
    setLocks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("consistency_lock", JSON.stringify(next));
      return next;
    });
  }

  const prompt = buildPrompt(dna, SCENES[sceneIdx]);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasDna = Boolean(dna.name);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Prompt Generator</h1>
          {hasDna && (
            <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
              {dna.archetype.toUpperCase()}
            </span>
          )}
        </div>

        <div className="p-4 lg:p-8">
          <StepProgress current={4} total={8} label="Prompt Generator" />
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Prompt Generator</p>
          <h2 className="text-2xl font-medium text-white mb-8">
            {dna.name || "Nový charakter"}{" "}
            <span className="italic text-muted2">prompt</span>
          </h2>

          {!hasDna && (
            <div className="bg-bg2 border border-border border-dashed rounded-md p-8 text-center mb-8">
              <p className="text-white font-medium mb-2">Chýba Character DNA</p>
              <p className="text-sm text-muted mb-4">Najprv vyplň DNA profil.</p>
              <button onClick={() => router.push("/create/dna")}
                className="font-mono text-[10px] bg-accent text-white px-4 py-2 rounded hover:bg-blue-400 transition-colors">
                → Vyplniť DNA
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left panel (2/3) */}
            <div className="col-span-2 space-y-5">
              {/* Scene presets */}
              <div>
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-3">// Scéna</p>
                <div className="flex flex-wrap gap-2">
                  {SCENES.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSceneIdx(i)}
                      className={`font-mono text-[10px] border px-3 py-1.5 rounded transition-colors ${
                        sceneIdx === i
                          ? "bg-accent/10 border-accent/40 text-accent"
                          : "border-border2 text-muted2 hover:border-border hover:text-ink"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generated prompt */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-[9px] text-muted uppercase tracking-widest">// Vygenerovaný prompt</p>
                  {hasDna && (
                    dna.soul_id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0" />
                        <span className="font-mono text-[9px] text-teal">Soul ID aktívny — tvár bude konzistentná</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
                        <span className="font-mono text-[9px] text-amber">
                          Soul ID chýba — tvár nebude konzistentná.{" "}
                          <a href="/create/soul" className="underline hover:text-white transition-colors">Pridaj Soul ID →</a>
                        </span>
                      </div>
                    )
                  )}
                </div>
                <textarea
                  readOnly
                  value={prompt}
                  rows={8}
                  className="w-full bg-[#050709] border border-border rounded p-4 font-mono text-[11.5px] text-teal leading-relaxed resize-none focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyPrompt}
                  className="font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-4 py-2 rounded hover:bg-teal/20 transition-colors"
                >
                  {copied ? "✓ Skopírované" : "Kopírovať prompt"}
                </button>
                <a
                  href="https://www.midjourney.com/imagine"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] bg-accent/10 border border-accent/30 text-accent px-4 py-2 rounded hover:bg-accent/20 transition-colors"
                >
                  Otvoriť Midjourney ↗
                </a>
                <a
                  href="https://higgsfield.ai/image"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] bg-amber/10 border border-amber/30 text-amber px-4 py-2 rounded hover:bg-amber/20 transition-colors"
                >
                  Otvoriť Higgsfield ↗
                </a>
              </div>
            </div>

            {/* Right panel (1/3) — Consistency Lock */}
            <div className="col-span-1">
              <div className="bg-bg2 border border-border rounded-md p-5 sticky top-20">
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-1">// Consistency Lock</p>
                <p className="text-[11px] text-muted2 mb-5 leading-relaxed">
                  Tieto prvky musia zostať rovnaké naprieč všetkými generovaniami.
                </p>
                <div className="space-y-4">
                  {LOCK_ITEMS.map(({ key, label, getValue }) => {
                    const on = Boolean(locks[key]);
                    const value = getValue(dna);
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-[10px] text-ink">{label}</span>
                          <Toggle on={on} onChange={() => toggleLock(key)} />
                        </div>
                        {on && value && (
                          <p className="font-mono text-[9px] text-teal leading-relaxed pl-1 border-l border-teal/30">
                            {value}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Continue */}
          <div className="mt-8 pt-6 border-t border-border flex items-center gap-3">
            <button
              onClick={() => router.push("/create/soul")}
              className="font-mono text-[11px] border border-border2 text-muted2 px-5 py-2.5 rounded hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button
              onClick={() => router.push("/create/lore")}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors"
            >
              Pokračovať →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

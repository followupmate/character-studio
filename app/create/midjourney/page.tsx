"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";

const SCENES = [
  {
    label: "Portrét",
    suffix: "close-up portrait, neutral dark background, direct gaze into camera, identity portrait",
  },
  {
    label: "Interiér",
    suffix: "indoor scene, apartment or café setting, intimate lighting, lifestyle photography",
  },
  {
    label: "Outdoor",
    suffix: "outdoor urban environment, natural light, street photography, candid moment",
  },
  {
    label: "Fashion",
    suffix: "full body fashion shot, editorial style, high fashion magazine photography",
  },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="w-full font-mono text-[11px] bg-teal/10 border border-teal/30 text-teal py-2.5 rounded hover:bg-teal/20 transition-colors"
    >
      {copied ? "✓ Skopírované" : label}
    </button>
  );
}

export default function MidjourneyPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA | null>(null);
  const [activeScene, setActiveScene] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw));
    } catch {}
  }, []);

  const basePrompt = dna?.midjourneyPrompt ?? (dna
    ? [
        dna.name,
        dna.visual.ethnicityLook,
        dna.visual.hair,
        dna.visual.skinTone,
        dna.visual.faceStructure,
        dna.visual.fashionStyle,
        dna.visual.colorPalette.join(", "),
        dna.personality.emotionalTone,
        dna.promptSettings.lighting,
        dna.promptSettings.camera,
        `ultra detailed --ar ${dna.promptSettings.aspectRatio} --stylize ${dna.promptSettings.stylize} --v ${dna.promptSettings.version}`,
      ].filter(Boolean).join(", ")
    : "");

  const scenePrompt =
    activeScene !== null
      ? `${basePrompt.replace(/--ar.*$/, "").trim()}, ${SCENES[activeScene].suffix}, ${basePrompt.match(/--ar.*$/)?.[0] ?? ""}`
      : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center">
          <h1 className="text-white font-medium text-sm tracking-wide">Midjourney</h1>
        </div>

        <div className="p-4 lg:p-8 max-w-3xl">
          <StepProgress current={3} total={5} label="Midjourney" />

          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Krok 3 z 5</p>
          <h2 className="text-2xl font-medium text-white mb-1">
            Vytvor vizuál <span className="italic text-muted2">charaktera</span>
          </h2>
          <p className="text-sm text-muted2 mb-8">
            Použi tento prompt na generovanie fotografií. Potrebuješ aspoň 15–20 záberov pre Soul tréning.
          </p>

          {/* Instructions */}
          <div className="bg-bg2 border border-border rounded-md p-5 mb-6">
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-4">// Ako na to</p>
            <ol className="space-y-2">
              {[
                "Skopíruj prompt nižšie",
                "Otvor Midjourney (Discord)",
                "Vlož prompt do /imagine",
                "Počkaj na 4 variácie (cca 1 min)",
                "Stiahni najlepšiu alebo všetky 4",
                "Vráť sa sem a opakuj s rôznymi scénami",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-[12px] text-muted2">
                  <span className="font-mono text-[10px] text-accent flex-shrink-0 w-4">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Base prompt */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <p className="font-mono text-[9px] text-muted uppercase tracking-widest">// Hlavný prompt</p>
              {dna && (
                <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 rounded-sm">
                  {dna.name}
                </span>
              )}
            </div>
            <pre className="bg-[#050709] border border-border rounded p-4 font-mono text-[11px] text-teal leading-relaxed whitespace-pre-wrap break-words mb-3">
              {basePrompt || "Načítavam..."}
            </pre>
            {basePrompt && <CopyButton text={basePrompt} label="Kopírovať prompt" />}
          </div>

          {/* Scene variations */}
          <div className="mb-6">
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-1">// Variácie scén</p>
            <p className="text-[12px] text-muted2 mb-4">
              Pre Soul tréning potrebuješ 15–20 fotiek. Generuj viac variácií:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {SCENES.map((scene, i) => (
                <button
                  key={i}
                  onClick={() => setActiveScene(activeScene === i ? null : i)}
                  className={`font-mono text-[10px] border px-3 py-2 rounded transition-colors ${
                    activeScene === i
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "border-border2 text-muted2 hover:border-border hover:text-ink"
                  }`}
                >
                  {scene.label}
                </button>
              ))}
            </div>

            {activeScene !== null && scenePrompt && (
              <div>
                <pre className="bg-[#050709] border border-border rounded p-4 font-mono text-[11px] text-teal leading-relaxed whitespace-pre-wrap break-words mb-3">
                  {scenePrompt}
                </pre>
                <CopyButton text={scenePrompt} label={`Kopírovať — ${SCENES[activeScene].label}`} />
              </div>
            )}
          </div>

          {/* Open Midjourney */}
          <div className="bg-bg3 border border-border rounded px-4 py-3 mb-6">
            <p className="font-mono text-[9px] text-muted mb-2">💡 Tip: Vygeneruj aspoň 4–6 rôznych záberov pre lepší Soul tréning</p>
            <a
              href="https://discord.com/channels/@me"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-accent underline hover:text-white transition-colors"
            >
              Otvoriť Midjourney Discord →
            </a>
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
              onClick={() => router.push("/create/soul")}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors"
            >
              Mám fotky, pokračujem →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

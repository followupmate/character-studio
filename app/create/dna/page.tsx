"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import StepProgress from "@/components/ui/StepProgress";
import { CharacterDNA } from "@/lib/archetypes";

const PLATFORMS = ["TikTok", "Instagram", "X/Twitter", "YouTube"];

const emptyDna: CharacterDNA = {
  id: "",
  name: "Nový charakter",
  archetype: "",
  identity: { ageAppearance: "", origin: "", niche: "" },
  visual: {
    ethnicityLook: "", hair: "", skinTone: "", faceStructure: "",
    bodyType: "", fashionStyle: "", colorPalette: [], accessories: [],
  },
  personality: {
    traits: [], emotionalTone: "", voiceStyle: "", humorStyle: "",
    relationshipStyle: "", worldview: "", signaturePhrases: [],
  },
  content: {
    platforms: [], pillars: [], targetAudience: "", postingVibe: "", monetization: [],
  },
  promptSettings: { aspectRatio: "4:5", stylize: 300, version: "7", camera: "", lighting: "" },
};

// ─── helpers ────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[9px] text-muted uppercase tracking-[0.15em] mb-1.5">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="form-input-base"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="form-input-base resize-none"
    />
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

function ArrayField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label} <span className="normal-case text-muted/60">(čiarkou)</span></Label>
      <Input
        value={value.join(", ")}
        onChange={(v) => onChange(v.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder={placeholder}
      />
    </div>
  );
}

function PhrasesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <Label>{label} <span className="normal-case text-muted/60">(každá fráza na novom riadku)</span></Label>
      <Textarea
        value={value.join("\n")}
        onChange={(v) => onChange(v.split("\n").map((s) => s.trim()).filter(Boolean))}
        placeholder={"not lonely. just processing.\nbuilt from data, damaged by poetry."}
        rows={4}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-surface-low hover:bg-surface-mid transition-colors"
      >
        <span className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {children}
        </div>
      )}
    </div>
  );
}

function FullWidthSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-surface-low hover:bg-surface-mid transition-colors"
      >
        <span className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────

export default function DnaPage() {
  const router = useRouter();
  const [dna, setDna] = useState<CharacterDNA>(emptyDna);
  const [saved, setSaved] = useState(false);
  const [createMethod, setCreateMethod] = useState<string | null>(null);
  const [mjCopied, setMjCopied] = useState(false);

  useEffect(() => {
    try {
      setCreateMethod(localStorage.getItem("create_method"));
      const raw = localStorage.getItem("character_dna");
      if (raw) setDna(JSON.parse(raw) as CharacterDNA);
    } catch {}
  }, []);

  async function copyMjPrompt() {
    if (!dna.midjourneyPrompt) return;
    await navigator.clipboard.writeText(dna.midjourneyPrompt);
    setMjCopied(true);
    setTimeout(() => setMjCopied(false), 2000);
  }

  function setIdentity(k: keyof CharacterDNA["identity"], v: string) {
    setDna((d) => ({ ...d, identity: { ...d.identity, [k]: v } }));
  }
  function setVisual(k: keyof CharacterDNA["visual"], v: string | string[]) {
    setDna((d) => ({ ...d, visual: { ...d.visual, [k]: v } }));
  }
  function setPersonality(k: keyof CharacterDNA["personality"], v: string | string[]) {
    setDna((d) => ({ ...d, personality: { ...d.personality, [k]: v } }));
  }
  function setContent(k: keyof CharacterDNA["content"], v: string | string[]) {
    setDna((d) => ({ ...d, content: { ...d.content, [k]: v } }));
  }
  function setPrompt(k: keyof CharacterDNA["promptSettings"], v: string | number) {
    setDna((d) => ({ ...d, promptSettings: { ...d.promptSettings, [k]: v } }));
  }

  function togglePlatform(platform: string) {
    setDna((d) => {
      const has = d.content.platforms.includes(platform);
      return {
        ...d,
        content: {
          ...d.content,
          platforms: has
            ? d.content.platforms.filter((p) => p !== platform)
            : [...d.content.platforms, platform],
        },
      };
    });
  }

  function saveDna() {
    localStorage.setItem("character_dna", JSON.stringify(dna));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">
              {dna.name || "Nový charakter"}
            </h1>
            {dna.archetype && (
              <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-[0.1em]">
                {dna.archetype.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveDna}
              className="font-mono text-[10px] uppercase tracking-[0.05em] bg-teal/10 border border-teal/30 text-teal px-4 py-1.5 hover:bg-teal/20 transition-colors"
            >
              {saved ? "✓ Uložené" : "Uložiť DNA"}
            </button>
            <button
              type="button"
              onClick={() => { saveDna(); router.push("/create/midjourney"); }}
              className="font-mono text-[10px] uppercase tracking-[0.05em] bg-accent text-white px-4 py-1.5 hover:bg-blue-400 transition-colors"
            >
              Uložiť a pokračovať →
            </button>
          </div>
        </div>

        <div className="p-4 lg:p-8 max-w-4xl space-y-5">
          <div>
            <StepProgress current={2} total={5} label="DNA Review" />
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">
              // Character DNA
            </p>
            <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-1">
              {dna.name || "Nový charakter"}
            </h2>
            <p className="font-mono text-[10px] text-muted2">
              Vyplň DNA profil. Všetky polia sa použijú na generovanie promptov a obsahu.
            </p>
          </div>

          {/* Create method banner */}
          {createMethod === "ai" && (
            <div className="bg-teal/5 border border-teal/20 px-4 py-3 font-mono text-[11px] text-teal">
              ✓ AI vygeneroval tvoj charakter. Skontroluj a uprav podľa potreby.
            </div>
          )}
          {createMethod === "preset" && (
            <div className="bg-accent/5 border border-accent/20 px-4 py-3 font-mono text-[11px] text-accent">
              Preset načítaný. Uprav podľa potreby.
            </div>
          )}

          {/* Name + archetype (top-level) */}
          <div className="bg-surface border border-border p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Character name"
              value={dna.name}
              onChange={(v) => setDna((d) => ({ ...d, name: v }))}
              placeholder="VIKA VOID"
            />
            <Field
              label="Main archetype"
              value={dna.archetype}
              onChange={(v) => setDna((d) => ({ ...d, archetype: v }))}
              placeholder="Slavic Cyber Muse"
            />
          </div>

          {/* Section 1: Identity */}
          <Section title="1 — Identity">
            <Field
              label="Age appearance"
              value={dna.identity.ageAppearance}
              onChange={(v) => setIdentity("ageAppearance", v)}
              placeholder="22-26"
            />
            <Field
              label="Niche"
              value={dna.identity.niche}
              onChange={(v) => setIdentity("niche", v)}
              placeholder="AI cyber muse, fashion, loneliness, techno"
            />
            <div className="md:col-span-2">
              <Label>Origin / fictional background</Label>
              <Textarea
                value={dna.identity.origin}
                onChange={(v) => setIdentity("origin", v)}
                placeholder="post-soviet futuristic cyber city"
                rows={2}
              />
            </div>
          </Section>

          {/* Section 2: Visual DNA */}
          <Section title="2 — Visual DNA">
            <Field
              label="Ethnicity / look"
              value={dna.visual.ethnicityLook}
              onChange={(v) => setVisual("ethnicityLook", v)}
              placeholder="Slavic / Eastern European"
            />
            <Field
              label="Hair"
              value={dna.visual.hair}
              onChange={(v) => setVisual("hair", v)}
              placeholder="platinum silver, soft black undertones"
            />
            <Field
              label="Skin tone"
              value={dna.visual.skinTone}
              onChange={(v) => setVisual("skinTone", v)}
              placeholder="pale skin with realistic texture"
            />
            <Field
              label="Face structure"
              value={dna.visual.faceStructure}
              onChange={(v) => setVisual("faceStructure", v)}
              placeholder="sharp cheekbones, elegant cold beauty"
            />
            <Field
              label="Body type"
              value={dna.visual.bodyType}
              onChange={(v) => setVisual("bodyType", v)}
              placeholder="slim editorial fashion model"
            />
            <Field
              label="Fashion style"
              value={dna.visual.fashionStyle}
              onChange={(v) => setVisual("fashionStyle", v)}
              placeholder="Berlin techno cyberpunk, oversized leather"
            />
            <ArrayField
              label="Color palette"
              value={dna.visual.colorPalette}
              onChange={(v) => setVisual("colorPalette", v)}
              placeholder="black, silver, cold blue, graphite"
            />
            <ArrayField
              label="Accessories"
              value={dna.visual.accessories}
              onChange={(v) => setVisual("accessories", v)}
              placeholder="chrome jewelry, black leather coat"
            />
          </Section>

          {/* Section 3: Personality DNA */}
          <FullWidthSection title="3 — Personality DNA">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ArrayField
                label="Personality traits"
                value={dna.personality.traits}
                onChange={(v) => setPersonality("traits", v)}
                placeholder="introverted, mysterious, poetic"
              />
              <Field
                label="Emotional tone"
                value={dna.personality.emotionalTone}
                onChange={(v) => setPersonality("emotionalTone", v)}
                placeholder="lonely but controlled"
              />
              <Field
                label="Voice style"
                value={dna.personality.voiceStyle}
                onChange={(v) => setPersonality("voiceStyle", v)}
                placeholder="calm, intimate, slightly detached"
              />
              <Field
                label="Humor style"
                value={dna.personality.humorStyle}
                onChange={(v) => setPersonality("humorStyle", v)}
                placeholder="dry, dark, minimal"
              />
              <Field
                label="Relationship style"
                value={dna.personality.relationshipStyle}
                onChange={(v) => setPersonality("relationshipStyle", v)}
                placeholder="distant but addictive"
              />
              <Field
                label="Worldview"
                value={dna.personality.worldview}
                onChange={(v) => setPersonality("worldview", v)}
                placeholder="humans are emotional systems pretending to be rational"
              />
            </div>
            <PhrasesField
              label="Signature phrases"
              value={dna.personality.signaturePhrases}
              onChange={(v) => setPersonality("signaturePhrases", v)}
            />
          </FullWidthSection>

          {/* Section 4: Content DNA */}
          <FullWidthSection title="4 — Content DNA">
            {/* Platforms checkboxes */}
            <div>
              <Label>Main platforms</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PLATFORMS.map((p) => {
                  const active = dna.content.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlatform(p)}
                      className={`font-mono text-[10px] uppercase tracking-[0.05em] border px-3 py-1.5 transition-colors ${
                        active
                          ? "bg-accent/10 border-accent/40 text-accent"
                          : "border-border2 text-muted2 hover:border-border hover:text-ink"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ArrayField
                label="Content pillars"
                value={dna.content.pillars}
                onChange={(v) => setContent("pillars", v)}
                placeholder="AI observing humans, late night thoughts"
              />
              <ArrayField
                label="Monetization direction"
                value={dna.content.monetization}
                onChange={(v) => setContent("monetization", v)}
                placeholder="fashion collabs, AI companion, digital merch"
              />
              <div className="md:col-span-2">
                <Field
                  label="Target audience"
                  value={dna.content.targetAudience}
                  onChange={(v) => setContent("targetAudience", v)}
                  placeholder="Gen Z, cyberpunk fans, fashion audience, lonely internet culture"
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  label="Posting vibe"
                  value={dna.content.postingVibe}
                  onChange={(v) => setContent("postingVibe", v)}
                  placeholder="cinematic, intimate, mysterious, emotionally viral"
                />
              </div>
            </div>
          </FullWidthSection>

          {/* Prompt Settings */}
          <Section title="Prompt Settings">
            <Field
              label="Aspect ratio"
              value={dna.promptSettings.aspectRatio}
              onChange={(v) => setPrompt("aspectRatio", v)}
              placeholder="4:5"
            />
            <div>
              <Label>Stylize <span className="normal-case text-muted/60">(0–1000)</span></Label>
              <input
                type="number"
                min={0}
                max={1000}
                value={dna.promptSettings.stylize}
                onChange={(e) => setPrompt("stylize", Number(e.target.value))}
                className="form-input-base"
              />
            </div>
            <Field
              label="Camera"
              value={dna.promptSettings.camera}
              onChange={(v) => setPrompt("camera", v)}
              placeholder="shot on Sony A7R IV, 85mm lens"
            />
            <Field
              label="Lighting"
              value={dna.promptSettings.lighting}
              onChange={(v) => setPrompt("lighting", v)}
              placeholder="moody blue cinematic lighting, rainy neon reflections"
            />
          </Section>

          {/* Midjourney Prompt Preview */}
          {dna.midjourneyPrompt && (
            <div className="bg-bg2 border border-border rounded-md overflow-hidden">
              <div className="bg-bg3 px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="font-mono text-[9px] text-muted uppercase tracking-widest">// Midjourney Prompt</p>
                <span className="font-mono text-[9px] text-muted2">Tento prompt použiješ v nasledujúcom kroku</span>
              </div>
              <div className="p-5">
                <div className="relative">
                  <pre className="bg-[#050709] border border-border rounded p-4 font-mono text-[11px] text-teal leading-relaxed whitespace-pre-wrap break-words pr-24">
                    {dna.midjourneyPrompt}
                  </pre>
                  <button
                    type="button"
                    onClick={copyMjPrompt}
                    className="absolute top-2 right-2 font-mono text-[8px] bg-bg2 border border-border text-muted2 px-2 py-1 rounded hover:text-ink hover:border-border2 transition-colors"
                  >
                    {mjCopied ? "✓" : "Kopírovať"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lore Preview (collapsed) */}
          {dna.lore && (
            <details className="bg-bg2 border border-border rounded-md overflow-hidden group">
              <summary className="px-5 py-4 bg-bg3 flex items-center justify-between cursor-pointer select-none">
                <span className="font-mono text-[9px] tracking-widest text-muted uppercase">Lore Preview</span>
                <span className="text-muted text-xs">▾</span>
              </summary>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(dna.lore).map(([key, value]) => (
                  <div key={key}>
                    <p className="font-mono text-[8px] text-muted uppercase tracking-widest mb-1">{key}</p>
                    <p className="font-mono text-[11px] text-muted2 leading-relaxed">{value as string}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Bottom actions */}
          <div className="flex items-center gap-3 pt-2 pb-8">
            <button
              type="button"
              onClick={() => router.push("/create")}
              className="font-mono text-[11px] uppercase tracking-[0.05em] border border-border2 text-muted2 px-5 py-2.5 hover:text-ink hover:border-border transition-colors"
            >
              ← Späť
            </button>
            <button
              type="button"
              onClick={() => { saveDna(); router.push("/create/midjourney"); }}
              className="font-mono text-[11px] uppercase tracking-[0.05em] bg-accent text-white px-5 py-2.5 hover:bg-blue-400 transition-colors"
            >
              Uložiť a pokračovať →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

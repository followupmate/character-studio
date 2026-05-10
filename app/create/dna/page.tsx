"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import { CharacterDNA } from "@/lib/archetypes";

// ─── Soul ID section ─────────────────────────────────────────

const CLI_COMMANDS = "higgsfield auth login\nhiggsfield soul-id list";

function SoulIdSection({
  soulId,
  onSave,
}: {
  soulId?: string;
  onSave: (id: string) => void;
}) {
  const [editing, setEditing] = useState(!soulId);
  const [input, setInput] = useState(soulId ?? "");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function copyCli() {
    await navigator.clipboard.writeText(CLI_COMMANDS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function save() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setSaved(true);
    setTimeout(() => { setSaved(false); setEditing(false); }, 900);
  }

  // ── State B — soul id set ────────────────────────────────
  if (soulId && !editing) {
    return (
      <div className="bg-bg2 border border-border rounded-md p-5 flex items-center justify-between">
        <div className="space-y-1">
          <p className="font-mono text-[9px] text-muted uppercase tracking-widest">
            // Visual Identity — Soul ID
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal flex-shrink-0" />
            <span className="font-mono text-[11px] text-teal font-medium">Soul ID aktívny</span>
          </div>
          <p className="font-mono text-[10px] text-ink">
            {soulId.slice(0, 8)}...{soulId.slice(-4)}
          </p>
          <p className="text-[11px] text-muted">
            Všetky generácie používajú tento Soul ID automaticky.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(true); setInput(soulId); }}
          className="font-mono text-[9px] text-muted2 hover:text-ink underline transition-colors flex-shrink-0 ml-6"
        >
          Zmeniť Soul ID
        </button>
      </div>
    );
  }

  // ── State A — no soul id / editing ──────────────────────
  return (
    <div className="bg-bg2 border border-border rounded-md overflow-hidden">
      <div className="bg-bg3 px-5 py-4 border-b border-border flex items-center justify-between">
        <p className="font-mono text-[9px] text-muted uppercase tracking-widest">
          // Visual Identity — Soul ID
        </p>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber" />
          <span className="font-mono text-[9px] text-amber">Soul ID chýba</span>
        </div>
      </div>

      <div className="p-5">
        <p className="text-[12px] text-muted2 mb-5 leading-relaxed">
          Soul ID zabezpečuje konzistentnú tvár naprieč všetkými generovaniami.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Krok 1 */}
          <div>
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-2">
              Krok 1: Vytvor Soul v Higgsfield
            </p>
            <p className="text-[12px] text-muted2 mb-4 leading-relaxed">
              Nahraj 15–20 fotiek charakteru do Higgsfield Soul trénera. Počkaj na dokončenie
              trénovania (5–10 minút).
            </p>
            <a
              href="https://higgsfield.ai/character"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-mono text-[10px] bg-amber/10 border border-amber/30 text-amber px-4 py-2 rounded hover:bg-amber/20 transition-colors"
            >
              Otvoriť Higgsfield Soul →
            </a>
            <p className="font-mono text-[9px] text-muted mt-2">
              Potrebuješ Higgsfield účet s aktívnym plánom.
            </p>
          </div>

          {/* Krok 2 */}
          <div>
            <p className="font-mono text-[9px] text-muted uppercase tracking-widest mb-2">
              Krok 2: Získaj Soul ID
            </p>
            <p className="text-[12px] text-muted2 mb-2 leading-relaxed">
              Po dokončení trénovania spusti tieto príkazy v termináli:
            </p>

            {/* Code block */}
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

            <p className="text-[11px] text-muted mb-2">
              Skopíruj ID tvojho charakteru zo stĺpca ID a vlož ho sem:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="Vlož Soul ID... (napr. fb42bf59-4397-...)"
                className="flex-1 min-w-0 bg-bg3 border border-border2 rounded px-3 py-2 font-mono text-[10px] text-ink placeholder:text-muted focus:outline-none focus:border-teal transition-colors"
              />
              <button
                type="button"
                onClick={save}
                disabled={!input.trim()}
                className="flex-shrink-0 font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-3 py-2 rounded hover:bg-teal/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {saved ? "✓ Uložené" : "Uložiť Soul ID"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <label className="block font-mono text-[9px] text-muted uppercase tracking-widest mb-1.5">
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
      className="w-full bg-bg border border-border2 rounded px-3 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors"
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
      className="w-full bg-bg border border-border2 rounded px-3 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:outline-none focus:border-accent transition-colors resize-none"
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
    <div className="bg-bg2 border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-bg3 hover:bg-bg2 transition-colors"
      >
        <span className="font-mono text-[9px] tracking-widest text-muted uppercase">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
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
    <div className="bg-bg2 border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-bg3 hover:bg-bg2 transition-colors"
      >
        <span className="font-mono text-[9px] tracking-widest text-muted uppercase">{title}</span>
        <span className={`text-muted text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("selected_archetype");
      if (raw) setDna(JSON.parse(raw) as CharacterDNA);
      else {
        const savedDna = localStorage.getItem("character_dna");
        if (savedDna) setDna(JSON.parse(savedDna) as CharacterDNA);
      }
    } catch {}
  }, []);

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

  function saveSoulId(id: string) {
    setDna((d) => {
      const updated = { ...d, soul_id: id };
      localStorage.setItem("character_dna", JSON.stringify(updated));
      return updated;
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
      <main className="flex-1 ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-white font-medium text-sm tracking-wide">
              {dna.name || "Nový charakter"}
            </h1>
            {dna.archetype && (
              <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
                {dna.archetype.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveDna}
              className="font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-4 py-1.5 rounded hover:bg-teal/20 transition-colors"
            >
              {saved ? "✓ Uložené" : "Uložiť DNA"}
            </button>
            <button
              type="button"
              onClick={() => { saveDna(); router.push("/create/prompts"); }}
              className="font-mono text-[10px] bg-accent text-white px-4 py-1.5 rounded hover:bg-blue-400 transition-colors"
            >
              Pokračovať → Prompt Generator
            </button>
          </div>
        </div>

        <div className="p-8 max-w-4xl space-y-5">
          <div>
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">
              // Character DNA
            </p>
            <h2 className="text-2xl font-medium text-white mb-1">
              {dna.name || "Nový charakter"}
            </h2>
            <p className="text-sm text-muted2">
              Vyplň DNA profil. Všetky polia sa použijú na generovanie promptov a obsahu.
            </p>
          </div>

          {/* Soul ID */}
          <SoulIdSection soulId={dna.soul_id} onSave={saveSoulId} />

          {/* Name + archetype (top-level) */}
          <div className="bg-bg2 border border-border rounded-md p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      className={`font-mono text-[10px] border px-3 py-1.5 rounded transition-colors ${
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
                className="w-full bg-bg border border-border2 rounded px-3 py-2 font-mono text-[11px] text-ink focus:outline-none focus:border-accent transition-colors"
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

          {/* Bottom actions */}
          <div className="flex items-center gap-3 pt-2 pb-8">
            <button
              type="button"
              onClick={saveDna}
              className="font-mono text-[11px] bg-teal/10 border border-teal/30 text-teal px-5 py-2.5 rounded hover:bg-teal/20 transition-colors"
            >
              {saved ? "✓ Uložené" : "Uložiť DNA"}
            </button>
            <button
              type="button"
              onClick={() => { saveDna(); router.push("/create/prompts"); }}
              className="font-mono text-[11px] bg-accent text-white px-5 py-2.5 rounded hover:bg-blue-400 transition-colors"
            >
              Pokračovať → Prompt Generator
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

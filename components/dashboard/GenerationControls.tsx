"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Media } from "@/types";
import { stripPromptHeader } from "@/lib/promptClean";
import type { PromptDirectorTargetModel, PromptPackage, PromptPackageSectionKey, SpeechSource, VideoIntentMode } from "@/lib/promptDirector";
import { MODEL_CAPABILITIES } from "@/lib/promptDirector/constants";

// Prompt Director v1 is now the engine BEHIND the existing generation UI, not a parallel workflow
// (see docs/PROMPT_DIRECTOR_V1_REPORT.md's UX revision) — one provider row, one prompt, Prompt
// Director quietly compiles for it when a profile exists. No SOUL2/second model selector anywhere
// in this file; the user only ever sees the SAME provider names they already know.

export interface GeneratorSpec {
  id: string;
  label: string;
  desc: string;
  model: string;
  loraScale: number;
  steps: number;
  guidance: number;
}

export type AudioStyle = "scene" | "ambient" | "dialogue" | "silent";

// UI provider -> Prompt Director model profile. ONLY providers with a real, live-wired profile are
// mapped (lib/promptDirector/constants.ts MODEL_CAPABILITIES.liveIntegration). Nano Banana / NB Pro
// / fal.ai / Veo have no Prompt Director profile — backend architecture is unchanged here, so those
// selections simply keep showing the legacy stored prompt, same as flag OFF.
export const GENERATOR_TO_TARGET_MODEL: Record<string, PromptDirectorTargetModel> = {
  higgsfield: "soul2",
  kling: "kling",
  "seedance-ref": "seedance",
  "seedance-i2v": "seedance",
  "seedance-fast": "seedance",
};

const VIDEO_MODES: VideoIntentMode[] = ["motion_only", "voice_over", "talking_to_camera"];
const SPEECH_SOURCES: SpeechSource[] = ["none", "auto", "manual"];

const SECTION_ORDER: PromptPackageSectionKey[] = [
  "reference", "identity", "scene", "appearance", "camera", "lighting",
  "realism", "imperfections", "expression", "humanMovement", "environmentMovement",
  "timeline", "speech", "lipSync", "audio", "stability", "negatives",
];
const SECTION_LABEL: Partial<Record<PromptPackageSectionKey, string>> = {
  reference: "Identity / Reference", identity: "Identity", scene: "Scene", appearance: "Appearance",
  camera: "Camera", lighting: "Lighting", realism: "Realism", imperfections: "Realism",
  expression: "Expression", humanMovement: "Motion", environmentMovement: "Motion",
  timeline: "Timeline", speech: "Speech", lipSync: "Lipsync", audio: "Audio",
  stability: "Stability", negatives: "Negatives",
};

function cleanPrompt(raw: string): string {
  return stripPromptHeader(raw);
}

export default function GenerationControls({
  media,
  promptDirectorEnabled,
  generators,
  generator,
  setGenerator,
  isVideoSlot,
  prompt,
  setPrompt,
  audioStyle,
  setAudioStyle,
  onGenerate,
  busy,
  error,
  generateLabel,
  elapsed,
}: {
  media: Media;
  promptDirectorEnabled: boolean;
  generators: readonly GeneratorSpec[];
  generator: string;
  setGenerator: (g: string) => void;
  isVideoSlot: boolean;
  prompt: string;
  setPrompt: (s: string) => void;
  audioStyle: AudioStyle;
  setAudioStyle: (a: AudioStyle) => void;
  onGenerate: () => void;
  busy: boolean;
  error: string | null;
  generateLabel: string;
  elapsed: number;
}) {
  const targetModel = GENERATOR_TO_TARGET_MODEL[generator];
  const pdActive = promptDirectorEnabled && !!targetModel;
  const capability = targetModel ? MODEL_CAPABILITIES[targetModel] : undefined;

  const [videoMode, setVideoMode] = useState<VideoIntentMode>("motion_only");
  const [action, setAction] = useState("");
  const [speechSource, setSpeechSource] = useState<SpeechSource>("none");
  const [speechText, setSpeechText] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState("en");
  const [speechTone, setSpeechTone] = useState("");

  const [compiledPackage, setCompiledPackage] = useState<PromptPackage | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function compile() {
    if (!targetModel) return;
    setCompiling(true);
    setCompileError(null);
    try {
      const res = await fetch("/api/characters/prompt-director-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          targetModel,
          ...(isVideoSlot
            ? {
                videoMode,
                action: action.trim() || undefined,
                speechSource,
                speechText: speechSource === "manual" ? speechText : undefined,
                speechLanguage: speechSource !== "none" ? speechLanguage : undefined,
                speechTone: speechSource === "auto" ? speechTone || undefined : undefined,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setCompiledPackage(data.promptPackage);
      setPrompt(cleanPrompt(data.promptPackage.positivePrompt));
      // §8 — audioStyle stays a real param the actual provider call uses (Kling's mmaudio bolt-on,
      // Seedance's generate_audio flag) even though it's no longer a separate control while Prompt
      // Director drives the UI — derive it from Speech instead of showing a second, redundant row.
      setAudioStyle(speechSource === "none" ? "scene" : "dialogue");
      setDirty(false);
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : "Kompilácia zlyhala");
    } finally {
      setCompiling(false);
    }
  }

  // Auto-compile on structural, click-driven changes only (provider / video mode / speech source) —
  // cheap and deterministic in every case except speechSource flipping TO "auto", which is still one
  // discrete click, not a per-keystroke call. Free-text fields (action / speech text / language /
  // tone) never auto-trigger a recompile — see the "Compile / Refresh prompt" affordance below. This
  // is the literal "don't call an LLM on every UI click" instruction: only intentional actions compile.
  useEffect(() => {
    if (pdActive) compile();
    else {
      setCompiledPackage(null);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdActive, generator, videoMode, speechSource]);

  useEffect(() => {
    if (pdActive) setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, speechText, speechLanguage, speechTone]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Provider row — the ONLY provider/model selector in this UI. */}
      <div className="flex gap-1.5 flex-wrap">
        {generators.map((g) => (
          <button
            key={g.id}
            onClick={() => setGenerator(g.id)}
            title={g.desc}
            className={`flex-1 font-mono text-[9px] uppercase tracking-[0.06em] py-1.5 border transition-colors ${
              generator === g.id
                ? isVideoSlot
                  ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                  : g.id === "google" || g.id === "google-pro"
                    ? "bg-teal/10 border-teal/40 text-teal"
                    : "bg-accent/10 border-accent/40 text-accent"
                : "border-border text-muted hover:text-ink hover:border-border2"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <p className="font-mono text-[8px] text-muted/60">{generators.find((g) => g.id === generator)?.desc}</p>

      {pdActive && (
        <span className="inline-flex items-center gap-1 self-start font-mono text-[8px] uppercase tracking-[0.08em] text-violet-400 bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5">
          Prompt Director v1 {compiling ? "· kompilujem…" : "✓"}
        </span>
      )}

      {isVideoSlot && pdActive && (
        <>
          <div>
            <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Video mode</div>
            <div className="flex gap-1.5 flex-wrap">
              {VIDEO_MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setVideoMode(m)}
                  className={`flex-1 font-mono text-[9px] uppercase tracking-[0.06em] py-1 border transition-colors ${
                    videoMode === m
                      ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                      : "border-border text-muted hover:text-ink hover:border-border2"
                  }`}
                >
                  {m.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            {videoMode !== "talking_to_camera" && (
              <input
                type="text"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Action (voliteľné) — napr. she walks toward the window"
                className="form-input-base w-full mt-1.5"
              />
            )}
          </div>

          {/* Speech — only shown for a provider that can actually carry it (§17: Kling has no
              native speech/lipsync, so it never sees this row at all — "ukáž iba tam kde dávajú zmysel"). */}
          {capability?.supportsSpeech && (
            <div>
              <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Speech</div>
              <div className="flex gap-1.5">
                {SPEECH_SOURCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeechSource(s)}
                    className={`flex-1 font-mono text-[9px] uppercase tracking-[0.06em] py-1 border transition-colors ${
                      speechSource === s
                        ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                        : "border-border text-muted hover:text-ink hover:border-border2"
                    }`}
                  >
                    {s === "none" ? "None" : s === "auto" ? "Auto" : "Custom"}
                  </button>
                ))}
              </div>
              {speechSource === "auto" && (
                <div className="flex gap-2 mt-1.5">
                  <input type="text" value={speechLanguage} onChange={(e) => setSpeechLanguage(e.target.value)} placeholder="Language (en, cs...)" className="form-input-base flex-1" />
                  <input type="text" value={speechTone} onChange={(e) => setSpeechTone(e.target.value)} placeholder="Tone (voliteľné)" className="form-input-base flex-1" />
                </div>
              )}
              {speechSource === "manual" && (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <textarea
                    value={speechText}
                    onChange={(e) => setSpeechText(e.target.value)}
                    rows={2}
                    placeholder="Presný text, ktorý sa vysloví verbatim…"
                    className="w-full bg-bg border border-border font-mono text-[10px] text-ink p-2 resize-none focus:outline-none focus:border-border2"
                  />
                  <input type="text" value={speechLanguage} onChange={(e) => setSpeechLanguage(e.target.value)} placeholder="Language (en, cs...)" className="form-input-base" />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Legacy audio-style row — only when Prompt Director isn't driving this provider (flag OFF,
          or a provider with no profile yet, e.g. Veo). Unchanged from today's behavior. */}
      {isVideoSlot && !pdActive && (generator.startsWith("seedance") || generator === "kling") && (
        <div className="flex gap-1 flex-wrap">
          {(["scene", "ambient", "dialogue", "silent"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAudioStyle(a)}
              className={`font-mono text-[8px] uppercase tracking-[0.06em] px-2 py-0.5 border transition-colors ${
                audioStyle === a ? "border-amber/50 bg-amber/10 text-amber" : "border-border text-muted hover:text-ink"
              }`}
            >
              {a === "scene" ? "🎙 scene" : a === "ambient" ? "🎵 ambient" : a === "dialogue" ? "🗣 dialogue" : "🔇 silent"}
            </button>
          ))}
        </div>
      )}

      {/* PROMPT — the single field the generation call actually uses, whether it came from Prompt
          Director or is today's stored slotPrompts.ts text. Never two competing prompt blocks. */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[8px] text-muted uppercase tracking-[0.08em]">Prompt</span>
          <div className="flex items-center gap-2">
            {pdActive && dirty && (
              <button onClick={compile} className="font-mono text-[8px] text-amber uppercase tracking-[0.06em] hover:text-amber/80">
                Compile / Refresh prompt
              </button>
            )}
            <button onClick={copyPrompt} className="font-mono text-[8px] text-muted hover:text-ink uppercase tracking-[0.06em]">
              {copied ? "✓ OK" : "Kopírovať"}
            </button>
          </div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          className="w-full bg-bg border border-border font-mono text-[10px] text-teal p-2 resize-none focus:outline-none focus:border-border2"
        />
        <AnimatePresence>
          {compileError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[8px] text-red-400 mt-1">
              {compileError}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <motion.button
        onClick={onGenerate}
        disabled={busy}
        className="w-full font-mono text-[9px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        whileHover={busy ? {} : { backgroundColor: "rgba(74,158,255,0.2)" }}
        whileTap={busy ? {} : { scale: 0.98 }}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-1.5">
            <motion.span className="w-2 h-2 border border-accent/60 border-t-accent rounded-full inline-block" animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
            {generateLabel} · {elapsed}s
          </span>
        ) : generateLabel}
      </motion.button>
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="font-mono text-[8px] text-red-400">
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Advanced — structured Prompt Director sections + legacy comparison, collapsed by default. */}
      {pdActive && (
        <div className="border border-border">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 font-mono text-[9px] text-muted hover:text-ink transition-colors"
          >
            <span className="uppercase tracking-[0.08em]">Advanced Prompt Details</span>
            <span className="material-symbols-outlined text-[14px]">{showAdvanced ? "expand_less" : "expand_more"}</span>
          </button>
          <AnimatePresence>
            {showAdvanced && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-2 pb-2 flex flex-col gap-1.5 border-t border-border pt-1.5">
                  {compiledPackage && (
                    <div className="border border-border divide-y divide-border">
                      {SECTION_ORDER.map((key) => {
                        const lines = compiledPackage.sections[key];
                        if (!lines || lines.length === 0) return null;
                        return (
                          <div key={key} className="px-2 py-1.5">
                            <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-0.5">{SECTION_LABEL[key]}</div>
                            <div className="font-mono text-[9px] text-muted2 leading-relaxed">{lines.join(" · ")}</div>
                          </div>
                        );
                      })}
                      {compiledPackage.negativePrompt && (
                        <div className="px-2 py-1.5">
                          <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-0.5">Negatives</div>
                          <div className="font-mono text-[9px] text-muted2 leading-relaxed">{compiledPackage.negativePrompt}</div>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setShowLegacy((v) => !v)}
                    className="font-mono text-[8px] text-muted hover:text-ink uppercase tracking-[0.06em] text-left"
                  >
                    {showLegacy ? "Skryť legacy prompt" : "Compare legacy prompt"}
                  </button>
                  {showLegacy && (
                    <pre className="bg-bg border border-border p-2 font-mono text-[9px] text-muted2 leading-relaxed whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                      {cleanPrompt(media.higgsfield_prompt)}
                    </pre>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

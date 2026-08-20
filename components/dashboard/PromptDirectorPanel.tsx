"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Media } from "@/types";
import { stripPromptHeader } from "@/lib/promptClean";
import type {
  PromptDirectorTargetModel,
  PromptPackage,
  PromptPackageSectionKey,
  SpeechSource,
  VideoIntentMode,
} from "@/lib/promptDirector";
import { MODEL_CAPABILITIES } from "@/lib/promptDirector/constants";

// Prompt Director v1 preview panel (spec §24) — compiles the SAME SceneBrief/slot/archetype this
// media row already has through lib/promptDirector via /api/characters/prompt-director-preview,
// without writing anything to the DB and without requiring the character's
// feature_flags.prompt_director_v1 to be on. This is the A/B tool: old prompt (media.higgsfield_prompt)
// vs. compiled PromptPackage, side by side, before anyone flips the flag for real.

const VIDEO_MODELS: PromptDirectorTargetModel[] = ["kling", "seedance", "higgsfield", "wan"];
const IMAGE_MODELS: PromptDirectorTargetModel[] = ["soul2"];

const VIDEO_MODES: VideoIntentMode[] = ["motion_only", "voice_over", "talking_to_camera"];
const SPEECH_SOURCES: SpeechSource[] = ["none", "auto", "manual"];

const SECTION_ORDER: PromptPackageSectionKey[] = [
  "reference",
  "identity",
  "scene",
  "appearance",
  "camera",
  "lighting",
  "videoSpecs",
  "realism",
  "imperfections",
  "expression",
  "humanMovement",
  "environmentMovement",
  "timeline",
  "speech",
  "lipSync",
  "audio",
  "stability",
  "negatives",
];

const SECTION_LABEL: Record<PromptPackageSectionKey, string> = {
  priority: "Priority",
  reference: "Reference / Identity",
  identity: "Identity",
  videoSpecs: "Video specs",
  scene: "Scene",
  camera: "Camera",
  lighting: "Lighting",
  appearance: "Appearance",
  realism: "Realism",
  imperfections: "Imperfections",
  expression: "Expression",
  humanMovement: "Motion",
  environmentMovement: "Environment motion",
  timeline: "Timeline",
  speech: "Speech",
  lipSync: "Lipsync",
  audio: "Audio",
  stability: "Stability",
  negatives: "Negatives",
};

function cleanPrompt(raw: string): string {
  return stripPromptHeader(raw);
}

export default function PromptDirectorPanel({
  media,
  onUsePrompt,
}: {
  media: Media;
  // targetModel is passed through so the caller can bind the ACTUAL generator to what was
  // compiled (see MediaCard.tsx's TARGET_MODEL_TO_GENERATOR) — explicit Prompt Director model
  // selection must win over today's ad-hoc default, not just fill in the prompt text.
  onUsePrompt: (promptText: string, targetModel: PromptDirectorTargetModel) => void;
}) {
  const isVideoSlot = media.type === "video";
  // reel_start_frame is a photo slot, but it's the one photo slot where a planned video mode
  // actually changes the compiled prompt (§21 first-frame prep) — see plannedVideoIntent below.
  const isStartFrame = media.slot === "reel_start_frame";
  const availableModels = isVideoSlot ? VIDEO_MODELS : IMAGE_MODELS;

  const [expanded, setExpanded] = useState(false);
  const [targetModel, setTargetModel] = useState<PromptDirectorTargetModel>(isVideoSlot ? "kling" : "soul2");
  const [videoMode, setVideoMode] = useState<VideoIntentMode>("motion_only");
  const [durationSec, setDurationSec] = useState(6);
  const [action, setAction] = useState("");
  const [speechSource, setSpeechSource] = useState<SpeechSource>("none");
  const [speechText, setSpeechText] = useState("");
  const [speechLanguage, setSpeechLanguage] = useState("en");
  const [speechTone, setSpeechTone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ promptPackage: PromptPackage; existingPrompt: string } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [copiedNew, setCopiedNew] = useState(false);

  async function compile() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/prompt-director-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          targetModel,
          ...(isVideoSlot || isStartFrame
            ? { videoMode, durationSec, action: action.trim() || undefined }
            : {}),
          ...(isVideoSlot
            ? {
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
      setResult({ promptPackage: data.promptPackage, existingPrompt: data.existingPrompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kompilácia zlyhala");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyNew() {
    if (!result) return;
    await navigator.clipboard.writeText(result.promptPackage.positivePrompt);
    setCopiedNew(true);
    setTimeout(() => setCopiedNew(false), 2000);
  }

  const capability = MODEL_CAPABILITIES[targetModel];
  const validation = result?.promptPackage.metadata.validation;

  return (
    <div className="border border-violet-500/30">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 font-mono text-[9px] text-violet-400 hover:text-violet-300 transition-colors"
      >
        <span className="uppercase tracking-[0.08em] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px]">tune</span>
          Prompt Director v1 · preview
        </span>
        <span className="material-symbols-outlined text-[14px]">{expanded ? "expand_less" : "expand_more"}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-2 border-t border-violet-500/20 pt-2">
              {/* Target model */}
              <div>
                <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Model</div>
                <div className="flex gap-1.5 flex-wrap">
                  {availableModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTargetModel(m)}
                      title={MODEL_CAPABILITIES[m].label}
                      className={`font-mono text-[9px] uppercase tracking-[0.06em] px-2 py-1 border transition-colors ${
                        targetModel === m
                          ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                          : "border-border text-muted hover:text-ink hover:border-border2"
                      }`}
                    >
                      {m}
                      {!MODEL_CAPABILITIES[m].liveIntegration && <span className="ml-1 opacity-60">⚠</span>}
                    </button>
                  ))}
                </div>
                {!capability.liveIntegration && (
                  <p className="font-mono text-[8px] text-amber mt-1">
                    ⚠ {capability.label} — kompiluje prompt, ale žiadny live provider call v tomto repe zatiaľ neexistuje.
                  </p>
                )}
              </div>

              {(isVideoSlot || isStartFrame) && (
                <>
                  {/* Video mode — on reel_start_frame this becomes plannedVideoIntent (§21), not
                      videoIntent: it shapes the starting POSE, this slot itself stays a photo. */}
                  <div>
                    <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">
                      {isStartFrame && !isVideoSlot ? "Planned Video Mode (first-frame prep)" : "Video Mode"}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {VIDEO_MODES.map((m) => (
                        <button
                          key={m}
                          onClick={() => setVideoMode(m)}
                          className={`font-mono text-[9px] uppercase tracking-[0.06em] px-2 py-1 border transition-colors ${
                            videoMode === m
                              ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                              : "border-border text-muted hover:text-ink hover:border-border2"
                          }`}
                        >
                          {m.replace(/_/g, " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration + action */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Duration (s)</div>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={durationSec}
                        onChange={(e) => setDurationSec(Number(e.target.value) || 6)}
                        className="form-input-base w-full"
                      />
                    </div>
                    <div className="flex-[2]">
                      <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Action (voliteľné)</div>
                      <input
                        type="text"
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                        placeholder="napr. she walks toward the window"
                        className="form-input-base w-full"
                      />
                    </div>
                  </div>
                </>
              )}

              {isVideoSlot && (
                <>
                  {/* Speech */}
                  <div>
                    <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-1">Speech</div>
                    <div className="flex gap-1.5">
                      {SPEECH_SOURCES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setSpeechSource(s)}
                          disabled={!capability.supportsSpeech && s !== "none"}
                          className={`flex-1 font-mono text-[9px] uppercase tracking-[0.06em] py-1 border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            speechSource === s
                              ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                              : "border-border text-muted hover:text-ink hover:border-border2"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    {!capability.supportsSpeech && (
                      <p className="font-mono text-[8px] text-muted mt-1">{capability.label.split(" — ")[0]} nemá speech/audio capability — sekcia sa vynechá z promptu.</p>
                    )}
                    {capability.supportsSpeech && speechSource === "auto" && (
                      <div className="flex gap-2 mt-1.5">
                        <input
                          type="text"
                          value={speechLanguage}
                          onChange={(e) => setSpeechLanguage(e.target.value)}
                          placeholder="Language (en, cs...)"
                          className="form-input-base flex-1"
                        />
                        <input
                          type="text"
                          value={speechTone}
                          onChange={(e) => setSpeechTone(e.target.value)}
                          placeholder="Tone (warm, playful...)"
                          className="form-input-base flex-1"
                        />
                      </div>
                    )}
                    {capability.supportsSpeech && speechSource === "manual" && (
                      <div className="flex flex-col gap-1.5 mt-1.5">
                        <textarea
                          value={speechText}
                          onChange={(e) => setSpeechText(e.target.value)}
                          rows={2}
                          placeholder="Presný text, ktorý sa vyslovi verbatim…"
                          className="w-full bg-bg border border-border font-mono text-[10px] text-ink p-2 resize-none focus:outline-none focus:border-border2"
                        />
                        <input
                          type="text"
                          value={speechLanguage}
                          onChange={(e) => setSpeechLanguage(e.target.value)}
                          placeholder="Language (en, cs...)"
                          className="form-input-base"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <motion.button
                onClick={compile}
                disabled={loading}
                className="w-full font-mono text-[9px] uppercase tracking-[0.05em] bg-violet-500/10 border border-violet-500/30 text-violet-400 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={loading ? {} : { backgroundColor: "rgba(139,92,246,0.15)" }}
                whileTap={loading ? {} : { scale: 0.98 }}
              >
                {loading ? "Kompilujem…" : "Compile Preview"}
              </motion.button>

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="font-mono text-[8px] text-red-400">
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {result && (
                <div className="flex flex-col gap-2 mt-1">
                  {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
                    <div className="border border-amber/30 bg-amber/5 px-2 py-1.5 flex flex-col gap-0.5">
                      {validation.errors.map((e, i) => (
                        <p key={`e${i}`} className="font-mono text-[8px] text-red-400">✕ {e}</p>
                      ))}
                      {validation.warnings.map((w, i) => (
                        <p key={`w${i}`} className="font-mono text-[8px] text-amber">⚠ {w}</p>
                      ))}
                    </div>
                  )}

                  {/* Structured sections */}
                  <div className="border border-border divide-y divide-border">
                    {SECTION_ORDER.map((key) => {
                      const lines = result.promptPackage.sections[key];
                      if (!lines || lines.length === 0) return null;
                      return (
                        <div key={key} className="px-2 py-1.5">
                          <div className="font-mono text-[8px] text-muted uppercase tracking-[0.08em] mb-0.5">{SECTION_LABEL[key]}</div>
                          <div className="font-mono text-[9px] text-muted2 leading-relaxed">{lines.join(" · ")}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Final provider prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[8px] text-violet-400 uppercase tracking-[0.08em]">Final provider prompt ({result.promptPackage.model})</span>
                      <button onClick={copyNew} className="font-mono text-[8px] text-muted hover:text-ink">
                        {copiedNew ? "✓ OK" : "Kopírovať"}
                      </button>
                    </div>
                    <pre className="bg-bg border border-violet-500/30 p-2 font-mono text-[9px] text-violet-300 leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                      {result.promptPackage.positivePrompt}
                    </pre>
                    {result.promptPackage.negativePrompt && (
                      <pre className="bg-bg border border-border p-2 mt-1 font-mono text-[9px] text-muted2 leading-relaxed whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                        Negative: {result.promptPackage.negativePrompt}
                      </pre>
                    )}
                  </div>

                  <button
                    onClick={() => setShowOld((v) => !v)}
                    className="font-mono text-[8px] text-muted hover:text-ink uppercase tracking-[0.06em] text-left"
                  >
                    {showOld ? "Skryť starý prompt" : "Porovnať so starým promptom"}
                  </button>
                  {showOld && (
                    <pre className="bg-bg border border-border p-2 font-mono text-[9px] text-teal leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                      {cleanPrompt(result.existingPrompt)}
                    </pre>
                  )}

                  {(() => {
                    const compiledModel = result.promptPackage.model as PromptDirectorTargetModel;
                    const compiledCapability = MODEL_CAPABILITIES[compiledModel];
                    // Stubs (higgsfield-video / wan) may be compiled and inspected here, but must
                    // never become the selected generator for a real call — there is no live
                    // provider behind them (see MODEL_CAPABILITIES.liveIntegration).
                    if (!compiledCapability?.liveIntegration) {
                      return (
                        <p className="font-mono text-[8px] text-amber">
                          ⚠ {compiledModel} nemá live provider integráciu — tento prompt sa nedá poslať na reálnu generáciu. Skopíruj si ho vyššie, alebo prepni model a skompiluj znova.
                        </p>
                      );
                    }
                    return (
                      <button
                        onClick={() => onUsePrompt(cleanPrompt(result.promptPackage.positivePrompt), compiledModel)}
                        className="w-full font-mono text-[9px] uppercase tracking-[0.05em] bg-teal/10 border border-teal/30 text-teal py-1.5"
                      >
                        Použiť tento prompt na regeneráciu ({compiledModel})
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

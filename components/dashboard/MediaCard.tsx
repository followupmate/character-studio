"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Media } from "@/types";

/* ─── Generator options ──────────────────────────────────────── */
const IMAGE_GENERATORS = [
  { id: "google",    label: "Nano Banana", desc: "Google · Nano Banana 2",  model: "google",     loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "google-pro",label: "NB Pro",      desc: "Google · Nano Banana Pro", model: "google-pro", loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "flux-lora", label: "fal.ai",      desc: "LoRA · face consistency",  model: "flux-lora",  loraScale: 0.85, steps: 45, guidance: 3.2 },
] as const;

const VIDEO_GENERATORS = [
  { id: "kling",       label: "Kling Pro",    desc: "fal.ai · Kling 2.1 Pro i2v · ~3 min",  model: "kling",       loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo",         label: "Veo 3.1 Fast", desc: "Google · Veo 3.1 Fast · ~2 min",       model: "veo",         loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo-quality", label: "Veo 3.1",      desc: "Google · Veo 3.1 · highest quality",   model: "veo-quality", loraScale: 0, steps: 0, guidance: 0 },
] as const;

const GENERATORS = [...IMAGE_GENERATORS, ...VIDEO_GENERATORS];
type GeneratorId = typeof GENERATORS[number]["id"];

/* ─── Lightbox ───────────────────────────────────────────────── */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Preview" className="w-full h-full object-contain" />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 flex items-center justify-center hover:bg-black/80"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}

const statusStyles: Record<string, string> = {
  pending:    "bg-surface-high text-muted border-border",
  generating: "bg-amber/10 text-amber border-amber/20",
  ready:      "bg-teal/10 text-teal border-teal/20",
  posted:     "bg-accent/10 text-accent border-accent/20",
  failed:     "bg-red-500/10 text-red-400 border-red-500/20",
};

function Badge({ status }: { status: string }) {
  const isGenerating = status === "generating";
  return (
    <span className={`font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border flex items-center gap-1.5 ${statusStyles[status] ?? statusStyles.pending}`}>
      {isGenerating && (
        <motion.span
          className="w-1 h-1 rounded-full bg-amber inline-block"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
      {status.toUpperCase()}
    </span>
  );
}

const SLOT_LABELS: Record<string, string> = {
  carousel_1: "CAROUSEL 1 · WIDE",
  carousel_2: "CAROUSEL 2 · MID",
  carousel_3: "CAROUSEL 3 · DETAIL",
  carousel_4: "CAROUSEL 4 · REVERSE",
  carousel_5: "CAROUSEL 5 · EMOTIONAL",
  reel_start_frame: "REEL · START FRAME",
  reel_video: "REEL · VIDEO (VEO 3.1)",
  story_bts: "STORY · BTS",
};

function formatHintFor(media: Media): string {
  if (media.channel === "reel") return "// 9:16 → Reels / TikTok / Shorts";
  if (media.channel === "story") return "// 9:16 → Instagram Story";
  if (media.channel === "feed") return "// 9:16 → IG Feed carousel";
  return media.type === "photo"
    ? "// aspect_ratio 4:5 → IG Feed"
    : "// aspect_ratio 9:16 → Reels / TikTok / Shorts";
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function cleanPrompt(raw: string): string {
  return raw
    .replace(/^Model:\s*Soul\s*\d+\s*[^\n]*?(Image\s*Prompt)?[\s:]*/i, "")
    .replace(/^Image\s*Prompt[\s:]*/i, "")
    .replace(/^[\s🖤🖼️]+/, "")
    .trim();
}

export default function MediaCard({ media, canAutoGenerate = false }: { media: Media; canAutoGenerate?: boolean }) {
  const isPhoto     = media.type === "photo";
  const isVideoSlot = media.slot === "reel_video";
  const isCarousel  = media.channel === "feed";
  const baseLabel = isPhoto ? "FOTO" : "VIDEO";
  const slotLabel = media.slot ? SLOT_LABELS[media.slot] ?? media.slot.toUpperCase() : null;
  const label = slotLabel ?? baseLabel;
  const model = isPhoto ? "Google · Nano Banana" : "Google · Veo 3.1";
  const formatHint = formatHintFor(media);
  const activeGenerators = isVideoSlot ? VIDEO_GENERATORS : IMAGE_GENERATORS;

  const [urlInput, setUrlInput] = useState(media.media_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hookCopied, setHookCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [generator, setGenerator] = useState<GeneratorId>(isVideoSlot ? "kling" : "google");
  const [showRegen, setShowRegen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState(cleanPrompt(media.higgsfield_prompt));
  const [regenGenerator, setRegenGenerator] = useState<GeneratorId>(isVideoSlot ? "kling" : "google");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  async function generateWithFal() {
    setGenerating(true);
    setGenerateError(null);
    const g = GENERATORS.find((x) => x.id === generator) ?? GENERATORS[0];
    try {
      const res = await fetch("/api/characters/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          model: g.model,
          loraScale: g.loraScale,
          steps: g.steps,
          guidance: g.guidance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      const result = data.results?.[0];
      if (!result?.success) {
        throw new Error(result?.error ?? data.message ?? "Generovanie zlyhalo");
      }
      const url = result.url;
      if (url) {
        setGeneratedUrl(url);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        throw new Error("API nevrátilo URL obrázka");
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Chyba pri generovaní");
    } finally {
      setGenerating(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setRegenError(null);
    const g = GENERATORS.find((x) => x.id === regenGenerator) ?? GENERATORS[0];
    try {
      const res = await fetch("/api/characters/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          model: g.model,
          loraScale: g.loraScale,
          steps: g.steps,
          guidance: g.guidance,
          promptOverride: regenPrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      const result = data.results?.[0];
      if (!result?.success) throw new Error(result?.error ?? "Regenerácia zlyhala");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Chyba pri regenerácii");
    } finally {
      setRegenerating(false);
    }
  }

  async function copyHook() {
    if (!media.hook_text) return;
    await navigator.clipboard.writeText(media.hook_text);
    setHookCopied(true);
    setTimeout(() => setHookCopied(false), 2000);
  }

  async function saveUrl() {
    if (!urlInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/characters/save-media-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setSaved(true);
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Chyba pri ukladaní");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(cleanPrompt(media.higgsfield_prompt));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function approvePost() {
    setPosting(true);
    await fetch("/api/characters/approve-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: media.id }),
    });
    setPosting(false);
    window.location.reload();
  }

  // ── posted ────────────────────────────────────────────────
  if (media.status === "posted") {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-[#050709] border border-border p-4 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[8px] tracking-[0.15em] text-muted uppercase mb-0.5">Asset Category</div>
            <div className="font-mono text-[11px] tracking-[0.05em] font-medium text-ink uppercase">{label}</div>
          </div>
          <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-[0.1em]">
            POSTNUTÉ
          </span>
        </div>
        {media.media_url && (
          <a
            href={media.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] text-accent hover:underline truncate"
          >
            → {media.media_url}
          </a>
        )}
        {isCarousel && media.hook_text && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px] text-muted tracking-widest uppercase">Hook:</span>
            <span className="font-mono text-[10px] text-white bg-bg border border-border2 px-2 py-0.5">{media.hook_text}</span>
          </div>
        )}
      </motion.div>
    );
  }

  // ── ready ─────────────────────────────────────────────────
  if (media.status === "ready") {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-[#050709] border border-border p-4 flex flex-col gap-3"
        whileHover={{ borderColor: "rgba(65,238,194,0.4)" }}
        transition={{ duration: 0.2 }}
      >
        {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[8px] tracking-[0.15em] text-muted uppercase mb-0.5">Asset Category</div>
            <div className="font-mono text-[11px] tracking-[0.05em] font-medium text-ink uppercase">{label}</div>
          </div>
          <Badge status={media.status} />
        </div>

        {isPhoto && media.media_url && !imgError && (
          <div className="relative group cursor-zoom-in" onClick={() => setLightboxUrl(media.media_url!)}>
            <motion.img
              src={media.media_url}
              alt="Generated"
              className="w-full object-cover max-h-48"
              onError={() => setImgError(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
              <span className="material-symbols-outlined text-[28px] text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">zoom_in</span>
            </div>
          </div>
        )}
        {isPhoto && media.media_url && imgError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-low border border-border">
            <span className="font-mono text-[8px] bg-teal/10 border border-teal/20 text-teal px-1.5 py-0.5">✓</span>
            <span className="font-mono text-[10px] text-muted2">Obrázok nahraný</span>
          </div>
        )}

        {media.media_url && (
          <a
            href={media.media_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] text-teal hover:underline truncate"
          >
            → {media.media_url}
          </a>
        )}

        {isCarousel && media.hook_text && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px] text-muted tracking-widest uppercase flex-shrink-0">Hook:</span>
            <motion.button
              onClick={copyHook}
              className="font-mono text-[10px] text-white bg-bg border border-border2 px-2 py-0.5 text-left"
              whileHover={{ borderColor: "rgba(74,158,255,0.5)" }}
              whileTap={{ scale: 0.97 }}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={hookCopied ? "copied" : "text"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  {hookCopied ? "✓ Skopírované" : media.hook_text}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>
        )}

        {/* Regenerate section */}
        <div className="border border-border">
          <button
            onClick={() => setShowRegen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 font-mono text-[9px] text-muted hover:text-ink transition-colors"
          >
            <span className="uppercase tracking-[0.08em]">Regenerovať s novým promptom</span>
            <span className="material-symbols-outlined text-[14px]">{showRegen ? "expand_less" : "expand_more"}</span>
          </button>
          <AnimatePresence>
            {showRegen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 flex flex-col gap-2 border-t border-border">
                  <textarea
                    value={regenPrompt}
                    onChange={(e) => setRegenPrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-bg border border-border font-mono text-[10px] text-teal p-2 resize-none focus:outline-none focus:border-border2 mt-2"
                    placeholder="Uprav prompt…"
                  />
                  <div className="flex gap-1.5">
                    {activeGenerators.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setRegenGenerator(g.id as GeneratorId)}
                        title={g.desc}
                        className={`flex-1 font-mono text-[9px] uppercase tracking-[0.06em] py-1 border transition-colors ${
                          regenGenerator === g.id
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
                  <motion.button
                    onClick={regenerate}
                    disabled={regenerating}
                    className="w-full font-mono text-[9px] uppercase tracking-[0.05em] bg-amber/10 border border-amber/30 text-amber py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={regenerating ? {} : { backgroundColor: "rgba(245,158,11,0.15)" }}
                    whileTap={regenerating ? {} : { scale: 0.98 }}
                  >
                    {regenerating ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <motion.span
                          className="w-2 h-2 border border-amber/60 border-t-amber rounded-full inline-block"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        />
                        {isVideoSlot ? "Regenerujem video…" : "Regenerujem…"}
                      </span>
                    ) : "Generovať znova"}
                  </motion.button>
                  <AnimatePresence>
                    {regenError && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="font-mono text-[8px] text-red-400"
                      >
                        {regenError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          onClick={approvePost}
          disabled={posting}
          className="w-full font-mono text-[10px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={posting ? {} : { backgroundColor: "rgba(74,158,255,0.2)" }}
          whileTap={posting ? {} : { scale: 0.98 }}
        >
          {posting ? "Postuje…" : "Označiť ako postnuté"}
        </motion.button>
      </motion.div>
    );
  }

  // ── pending / generating ──────────────────────────────────
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="bg-[#050709] border border-border p-4 flex flex-col gap-3"
      whileHover={{ borderColor: "rgba(65,66,72,1)" }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[8px] tracking-[0.15em] text-muted uppercase mb-0.5">Asset Category</div>
          <div className="font-mono text-[11px] tracking-[0.05em] font-medium text-ink uppercase">
            {label}
            <span className="ml-2 text-muted normal-case font-normal text-[9px]">{model}</span>
          </div>
        </div>
        <Badge status={media.status} />
      </div>

      {/* Generate */}
      <div className="flex flex-col gap-1.5">
        {canAutoGenerate ? (
          <>
            {/* Generator selector */}
            <div className="flex gap-1.5">
              {activeGenerators.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGenerator(g.id as GeneratorId)}
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
            <p className="font-mono text-[8px] text-muted/60">
              {activeGenerators.find((g) => g.id === generator)?.desc}
            </p>
            {isVideoSlot && (
              <p className="font-mono text-[8px] text-violet-400/70">
                Vyžaduje vygenerovaný Start Frame · Veo berie ho ako vstupný obrázok
              </p>
            )}
            <motion.button
              onClick={generateWithFal}
              disabled={generating}
              className="inline-flex items-center gap-1.5 font-mono text-[9px] bg-accent/10 border border-accent/30 text-accent px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={generating ? {} : { backgroundColor: "rgba(74,158,255,0.2)" }}
              whileTap={generating ? {} : { scale: 0.97 }}
            >
              {generating ? (
                <>
                  <motion.span
                    className="w-2 h-2 border border-accent/60 border-t-accent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                  />
                  {isVideoSlot ? "Generujem video (~2 min)…" : "Generujem…"}
                </>
              ) : generatedUrl ? (
                <>
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  Vygenerované
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[12px]">{isVideoSlot ? "movie" : "auto_awesome"}</span>
                  {isVideoSlot ? "Generovať video" : "Generovať"}
                </>
              )}
            </motion.button>
            <AnimatePresence>
              {generateError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="font-mono text-[8px] text-red-400"
                >
                  {generateError}
                </motion.p>
              )}
            </AnimatePresence>
          </>
        ) : (
          <p className="font-mono text-[9px] text-muted">Generovanie nie je dostupné pre tento slot</p>
        )}
        <p className="font-mono text-[9px] text-muted">{formatHint}</p>
      </div>

      {/* Slot metadata */}
      {(media.shot_archetype || media.visual_signature) && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-1">
          {media.shot_archetype && (
            <span className="font-mono text-[8px] tracking-[0.1em] bg-bg3 border border-border text-muted2 px-1.5 py-0.5 uppercase">
              {media.shot_archetype.replace(/_/g, " ")}
            </span>
          )}
          {media.visual_signature && (
            <span className="font-mono text-[8px] tracking-[0.05em] text-muted truncate">
              {media.visual_signature.palette} / {media.visual_signature.lens} / {media.visual_signature.movement}
            </span>
          )}
        </div>
      )}

      {/* Hook text */}
      {isCarousel && media.hook_text && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[8px] text-muted tracking-widest uppercase flex-shrink-0">Hook:</span>
          <motion.button
            onClick={copyHook}
            className="font-mono text-[10px] text-white bg-bg border border-border2 px-2 py-0.5 text-left"
            whileHover={{ borderColor: "rgba(74,158,255,0.5)" }}
            whileTap={{ scale: 0.97 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={hookCopied ? "copied" : "text"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {hookCopied ? "✓ Skopírované" : media.hook_text}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      )}

      {/* Prompt block */}
      <div className="relative">
        <pre className="bg-bg border border-border p-3 font-mono text-[10px] text-teal leading-relaxed whitespace-pre-wrap break-words pr-20 max-h-72 overflow-y-auto">
          {cleanPrompt(media.higgsfield_prompt)}
        </pre>
        <motion.button
          onClick={copyPrompt}
          className="absolute top-2 right-2 font-mono text-[8px] bg-surface border border-border text-muted2 px-2 py-1"
          whileHover={{ borderColor: "#414752", color: "#e2e2ea" }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={copied ? "ok" : "copy"}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
            >
              {copied ? "✓ OK" : "Kopírovať"}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* URL input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setSaveError(null); }}
            onKeyDown={(e) => e.key === "Enter" && saveUrl()}
            placeholder="Vlož URL z Higgsfield..."
            className="form-input-base flex-1 min-w-0"
          />
          <motion.button
            onClick={saveUrl}
            disabled={saving || !urlInput.trim()}
            className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] bg-teal/10 border border-teal/30 text-teal px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={saving || !urlInput.trim() ? {} : { backgroundColor: "rgba(65,238,194,0.18)" }}
            whileTap={saving || !urlInput.trim() ? {} : { scale: 0.97 }}
          >
            {saved ? "✓" : saving ? "Ukladám…" : "Uložiť"}
          </motion.button>
        </div>
        <AnimatePresence>
          {saveError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="font-mono text-[9px] text-red-400"
            >
              {saveError}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

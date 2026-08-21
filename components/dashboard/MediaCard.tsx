"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Media } from "@/types";
import { stripPromptHeader } from "@/lib/promptClean";
import { slotLabel } from "@/lib/slots";
import GenerationControls, { AudioStyle, GeneratorSpec } from "./GenerationControls";

/* ─── Generator options ──────────────────────────────────────── */
const IMAGE_GENERATORS: readonly GeneratorSpec[] = [
  { id: "google",    label: "Nano Banana", desc: "Google · Nano Banana 2 · rich environment", model: "google",     loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "google-pro",label: "NB Pro",      desc: "Google · Nano Banana Pro · best environment", model: "google-pro", loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "flux-lora", label: "fal.ai",      desc: "LoRA · faithful face · handles intimate",   model: "flux-lora",  loraScale: 0.85, steps: 45, guidance: 3.2 },
  { id: "higgsfield",label: "Higgsfield",  desc: "Soul 2.0 · najvernejšia tvár · max-intimate · ~2 min", model: "higgsfield", loraScale: 0, steps: 0, guidance: 0 },
];

const VIDEO_GENERATORS: readonly GeneratorSpec[] = [
  { id: "kling",         label: "Kling Pro",      desc: "fal.ai · Kling 2.1 i2v · verná tvár + scene audio (mmaudio) · ~4 min · ODPORÚČANÉ pre postavy", model: "kling", loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo",           label: "Veo 3.1 Fast",    desc: "Google · Veo 3.1 Fast · ~2 min · natívny dialóg/zvuk (Prompt Director → Speech)",  model: "veo",         loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo-quality",   label: "Veo 3.1",         desc: "Google · Veo 3.1 Quality · vyššia kvalita · ~4 min · natívny dialóg/zvuk (Prompt Director → Speech)",    model: "veo-quality", loraScale: 0, steps: 0, guidance: 0 },
  // Not a hard block — fal.ai's content-policy rejection is intermittent, scene/prompt-dependent,
  // not a guaranteed failure for every photorealistic character (confirmed working generations).
  { id: "seedance-ref",  label: "Seedance Ref",  desc: "fal.ai · Seedance reference-to-video · zvyčajne funguje aj s reálnou tvárou, zriedka narazí na content-policy", model: "seedance-ref",  loraScale: 0, steps: 0, guidance: 0 },
  { id: "seedance-i2v",  label: "Seedance i2v",  desc: "fal.ai · Seedance i2v, 1080p · zvyčajne funguje aj s reálnou tvárou, zriedka narazí na content-policy", model: "seedance-i2v",  loraScale: 0, steps: 0, guidance: 0 },
  { id: "seedance-fast", label: "Seedance Fast",  desc: "fal.ai · Seedance i2v, 720p rýchla verzia · zvyčajne funguje aj s reálnou tvárou, zriedka narazí na content-policy", model: "seedance-fast", loraScale: 0, steps: 0, guidance: 0 },
];

const GENERATORS = [...IMAGE_GENERATORS, ...VIDEO_GENERATORS];

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

function formatHintFor(media: Media): string {
  if (media.channel === "reel") return "// 9:16 → Reels / TikTok / Shorts";
  if (media.channel === "story") return "// 9:16 → Instagram Story";
  if (media.channel === "feed") return "// 4:5 → IG Feed carousel (9:16 nie je podporované)";
  return media.type === "photo"
    ? "// aspect_ratio 4:5 → IG Feed"
    : "// aspect_ratio 9:16 → Reels / TikTok / Shorts";
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function cleanPrompt(raw: string): string {
  return stripPromptHeader(raw);
}

export default function MediaCard({
  media,
  canAutoGenerate = false,
  promptDirectorEnabled = false,
}: {
  media: Media;
  canAutoGenerate?: boolean;
  promptDirectorEnabled?: boolean;
}) {
  const isPhoto     = media.type === "photo";
  const isVideoSlot = media.slot === "reel_video";
  // Engine mix per slot: wide/lifestyle establishing → Google NB; feed/portrait + story → fal LoRA.
  const isWideSlot  = media.slot === "carousel_1" || media.slot === "reel_start_frame";
  const defaultImageGen = isWideSlot ? "google" : "flux-lora";
  const isCarousel  = media.channel === "feed";
  const baseLabel = isPhoto ? "FOTO" : "VIDEO";
  const slotLabelText = slotLabel(media.slot, "");
  const label = slotLabelText || baseLabel;
  const model = isPhoto ? "Google · Nano Banana" : "Google · Veo 3.1";
  const formatHint = formatHintFor(media);
  const activeGenerators = isVideoSlot ? VIDEO_GENERATORS : IMAGE_GENERATORS;
  const isReady = media.status === "ready";

  const [urlInput, setUrlInput] = useState(media.media_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hookCopied, setHookCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Unified generation state — ONE provider, ONE prompt, ONE generate action, used whether this is
  // the first generation or a regeneration. Prompt Director (when active for the selected provider)
  // writes into `prompt` the same way a hand-edit would — see GenerationControls — so there is never
  // a second, competing prompt anywhere in this UI.
  const [generator, setGenerator] = useState<string>(isVideoSlot ? "kling" : defaultImageGen);
  const [prompt, setPrompt] = useState(cleanPrompt(media.higgsfield_prompt));
  const [audioStyle, setAudioStyle] = useState<AudioStyle>("scene");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // Elapsed-seconds counter while generation runs — image gen takes 15–60s,
  // video up to ~4 min; a static spinner alone reads as frozen.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // Async reel-video flow: submit a fal.queue job, then poll until ready (no serverless timeout).
  // The job state persists on the media row, so if you reload mid-generation, clicking again resumes it.
  async function runAsyncVideo(model: string, aStyle: string, promptOverride?: string, forceRestart?: boolean): Promise<string> {
    // forceRestart only on the first (submit) call — polling calls must resume the
    // same job, not spawn a new one each poll.
    const call = (restart?: boolean) =>
      fetch("/api/characters/video-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, model, audioStyle: aStyle, promptOverride, forceRestart: restart }),
      }).then((r) => r.json());
    const sub = await call(forceRestart);
    if (sub.status === "error") throw new Error(sub.error ?? "Video submit zlyhal");
    if (sub.status === "ready") return sub.url;
    for (let i = 0; i < 44; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      const pd = await call();
      if (pd.status === "ready") return pd.url;
      if (pd.status === "error") throw new Error(pd.error ?? "Video zlyhalo");
    }
    throw new Error("Video beží dlhšie — beží na pozadí, obnov stránku a klikni znova pre dokončenie");
  }

  function isAsyncVideo(m: string) {
    return isVideoSlot && (m === "kling" || m.startsWith("seedance"));
  }

  // Higgsfield Soul image flow: the server route generates via the official SDK (~30-40s) and returns
  // the final Supabase URL directly. If the request drops/times out, fall back to polling the row.
  //
  // IMPORTANT: only a genuine network-level failure (fetch() itself throwing — connection drop,
  // client-side timeout) falls through to polling. A real HTTP response, even an error one, is
  // authoritative for THIS attempt and must be surfaced directly — falling through to polling on
  // any non-ok response used to re-read chs_media.generation_status/last_error, which can hold a
  // STALE value from an unrelated earlier failure (e.g. the daily batch's prompt-build step) that
  // this attempt never touched, resurfacing a misleading old error (e.g. an Anthropic credit
  // error) even after the real problem was fixed.
  async function runHiggsfield(promptOverride?: string): Promise<string> {
    let res: Response | null = null;
    let data: { success?: boolean; media_url?: string; error?: string } = {};
    try {
      res = await fetch("/api/characters/generate-higgsfield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, promptOverride }),
      });
      data = await res.json().catch(() => ({}));
    } catch {
      res = null; // genuine network failure — fall through to polling below
    }

    if (res) {
      if (res.ok && data.success && data.media_url) return data.media_url;
      throw new Error(data?.error ?? `Chyba ${res.status}`);
    }

    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const s = await fetch(`/api/characters/generate-higgsfield?id=${media.id}`).then((r) => r.json());
      if (s.status === "ready" && s.media_url) return s.media_url;
      if (s.generation_status === "failed" || s.status === "failed") {
        throw new Error(s.last_error ?? "Higgsfield generovanie zlyhalo");
      }
    }
    throw new Error("Higgsfield beží dlhšie — obnov stránku o chvíľu");
  }

  // Single generation entry point for both a first generation and a regeneration — the only
  // difference (matching today's prior behavior) is forceRestart on the async-video path, so a
  // regen never silently resumes a stale job from an earlier attempt.
  async function runGeneration() {
    setBusy(true);
    setActionError(null);
    const g = GENERATORS.find((x) => x.id === generator) ?? GENERATORS[0];
    // Only send an override when the visible prompt actually differs from what's stored (Prompt
    // Director compiled something new, or the user hand-edited the textarea) — an untouched prompt
    // (flag OFF, or a provider with no Prompt Director profile) must reproduce today's exact
    // behavior: the ORIGINAL stored higgsfield_prompt is used as-is and never rewritten in the DB.
    const promptOverride = prompt.trim() !== cleanPrompt(media.higgsfield_prompt).trim() ? prompt.trim() : undefined;
    const forceRestart = isReady ? true : undefined;
    try {
      if (isAsyncVideo(g.model)) {
        const url = await runAsyncVideo(g.model, audioStyle, promptOverride, forceRestart);
        setGeneratedUrl(url);
        setTimeout(() => window.location.reload(), isReady ? 800 : 1200);
        return;
      }
      if (g.model === "higgsfield") {
        const url = await runHiggsfield(promptOverride);
        setGeneratedUrl(url);
        setTimeout(() => window.location.reload(), isReady ? 800 : 1200);
        return;
      }
      const res = await fetch("/api/characters/generate-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: media.id,
          model: g.model,
          loraScale: g.loraScale,
          steps: g.steps,
          guidance: g.guidance,
          audioStyle,
          promptOverride,
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
        setTimeout(() => window.location.reload(), isReady ? 800 : 1200);
      } else {
        throw new Error("API nevrátilo URL obrázka");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Chyba pri generovaní");
    } finally {
      setBusy(false);
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

        <GenerationControls
          media={media}
          promptDirectorEnabled={promptDirectorEnabled}
          generators={activeGenerators}
          generator={generator}
          setGenerator={setGenerator}
          isVideoSlot={isVideoSlot}
          prompt={prompt}
          setPrompt={setPrompt}
          audioStyle={audioStyle}
          setAudioStyle={setAudioStyle}
          onGenerate={runGeneration}
          busy={busy}
          error={actionError}
          generateLabel={busy ? (isVideoSlot ? "Generujem video" : "Generujem") : "Generovať znova"}
          elapsed={elapsed}
        />

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
        <Badge status={busy ? "generating" : media.status} />
      </div>

      {/* Live generation skeleton */}
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="relative overflow-hidden bg-surface-low border border-border h-28 flex items-center justify-center">
              <div className="absolute inset-0 shimmer" />
              <div className="relative flex flex-col items-center gap-1.5">
                <motion.span
                  className="material-symbols-outlined text-[20px] text-muted"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                >
                  progress_activity
                </motion.span>
                <span className="font-mono text-[9px] text-muted2 tracking-[0.08em]">
                  {isVideoSlot ? "VIDEO SA GENERUJE" : "OBRÁZOK SA GENERUJE"} · {elapsed}s
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate */}
      <div className="flex flex-col gap-1.5">
        {canAutoGenerate ? (
          <GenerationControls
            media={media}
            promptDirectorEnabled={promptDirectorEnabled}
            generators={activeGenerators}
            generator={generator}
            setGenerator={setGenerator}
            isVideoSlot={isVideoSlot}
            prompt={prompt}
            setPrompt={setPrompt}
            audioStyle={audioStyle}
            setAudioStyle={setAudioStyle}
            onGenerate={runGeneration}
            busy={busy}
            error={actionError}
            generateLabel={
              busy
                ? isVideoSlot
                  ? "Generujem video (~2 min)"
                  : generator === "higgsfield"
                    ? "Higgsfield Soul (~2 min)"
                    : "Generujem"
                : generatedUrl
                  ? "Vygenerované"
                  : isVideoSlot
                    ? "Generovať video"
                    : "Generovať"
            }
            elapsed={elapsed}
          />
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

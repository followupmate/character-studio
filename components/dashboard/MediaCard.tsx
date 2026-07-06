"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Media } from "@/types";
import { stripPromptHeader } from "@/lib/promptClean";
import { slotLabel } from "@/lib/slots";

/* ─── Generator options ──────────────────────────────────────── */
const IMAGE_GENERATORS = [
  { id: "google",    label: "Nano Banana", desc: "Google · Nano Banana 2 · rich environment", model: "google",     loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "google-pro",label: "NB Pro",      desc: "Google · Nano Banana Pro · best environment", model: "google-pro", loraScale: 0,    steps: 0,  guidance: 0   },
  { id: "flux-lora", label: "fal.ai",      desc: "LoRA · faithful face · handles intimate",   model: "flux-lora",  loraScale: 0.85, steps: 45, guidance: 3.2 },
  { id: "higgsfield",label: "Higgsfield",  desc: "Soul 2.0 · najvernejšia tvár · max-intimate · ~2 min", model: "higgsfield", loraScale: 0, steps: 0, guidance: 0 },
] as const;

const VIDEO_GENERATORS = [
  { id: "kling",         label: "Kling Pro",      desc: "fal.ai · Kling 2.1 i2v · verná tvár + scene audio (mmaudio) · ~4 min · ODPORÚČANÉ pre postavy", model: "kling", loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo",           label: "Veo 3.1 Fast",    desc: "Google · Veo 3.1 Fast · ~2 min · zvláda realistické tváre",  model: "veo",         loraScale: 0, steps: 0, guidance: 0 },
  { id: "veo-quality",   label: "Veo 3.1",         desc: "Google · Veo 3.1 Quality · vyššia kvalita · ~4 min",    model: "veo-quality", loraScale: 0, steps: 0, guidance: 0 },
  { id: "seedance-ref",  label: "Seedance Ref",  desc: "⚠ Seedance odmieta realistické tváre (content policy) — pre postavy nefunguje", model: "seedance-ref",  loraScale: 0, steps: 0, guidance: 0 },
  { id: "seedance-i2v",  label: "Seedance i2v",  desc: "⚠ Seedance odmieta realistické tváre (content policy) — pre postavy nefunguje", model: "seedance-i2v",  loraScale: 0, steps: 0, guidance: 0 },
  { id: "seedance-fast", label: "Seedance Fast",  desc: "⚠ Seedance odmieta realistické tváre (content policy) — pre postavy nefunguje", model: "seedance-fast", loraScale: 0, steps: 0, guidance: 0 },
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

export default function MediaCard({ media, canAutoGenerate = false }: { media: Media; canAutoGenerate?: boolean }) {
  const isPhoto     = media.type === "photo";
  const isVideoSlot = media.slot === "reel_video";
  // Engine mix per slot: wide/lifestyle establishing → Google NB; feed/portrait + story → fal LoRA.
  const isWideSlot  = media.slot === "carousel_1" || media.slot === "reel_start_frame";
  const defaultImageGen: GeneratorId = isWideSlot ? "google" : "flux-lora";
  const isCarousel  = media.channel === "feed";
  const baseLabel = isPhoto ? "FOTO" : "VIDEO";
  const slotLabelText = slotLabel(media.slot, "");
  const label = slotLabelText || baseLabel;
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
  const [generator, setGenerator] = useState<GeneratorId>(isVideoSlot ? "kling" : defaultImageGen);
  const [audioStyle, setAudioStyle] = useState<"scene" | "ambient" | "dialogue" | "silent">("scene");
  const [showRegen, setShowRegen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState(cleanPrompt(media.higgsfield_prompt));
  const [regenGenerator, setRegenGenerator] = useState<GeneratorId>(isVideoSlot ? "kling" : defaultImageGen);
  const [regenAudioStyle, setRegenAudioStyle] = useState<"scene" | "ambient" | "dialogue" | "silent">("scene");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Elapsed-seconds counter while any generation runs — image gen takes 15–60s,
  // video up to ~4 min; a static spinner alone reads as frozen.
  const busy = generating || regenerating;
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
  async function runHiggsfield(promptOverride?: string): Promise<string> {
    let lastErr: string | null = null;
    try {
      const res = await fetch("/api/characters/generate-higgsfield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: media.id, promptOverride }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.media_url) return data.media_url;
      lastErr = data?.error ?? `Chyba ${res.status}`;
    } catch {
      // network error / serverless timeout — fall through to polling in case it still finished
    }
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const s = await fetch(`/api/characters/generate-higgsfield?id=${media.id}`).then((r) => r.json());
      if (s.status === "ready" && s.media_url) return s.media_url;
      if (s.generation_status === "failed" || s.status === "failed") {
        throw new Error(s.last_error ?? lastErr ?? "Higgsfield generovanie zlyhalo");
      }
    }
    throw new Error(lastErr ?? "Higgsfield beží dlhšie — obnov stránku o chvíľu");
  }

  async function generateWithFal() {
    setGenerating(true);
    setGenerateError(null);
    const g = GENERATORS.find((x) => x.id === generator) ?? GENERATORS[0];
    try {
      if (isAsyncVideo(g.model)) {
        const url = await runAsyncVideo(g.model, audioStyle);
        setGeneratedUrl(url);
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
      if (g.model === "higgsfield") {
        const url = await runHiggsfield();
        setGeneratedUrl(url);
        setTimeout(() => window.location.reload(), 1200);
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
      if (isAsyncVideo(g.model)) {
        await runAsyncVideo(g.model, regenAudioStyle, regenPrompt.trim() || undefined, true);
        setTimeout(() => window.location.reload(), 800);
        return;
      }
      if (g.model === "higgsfield") {
        await runHiggsfield(regenPrompt.trim() || undefined);
        setTimeout(() => window.location.reload(), 800);
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
          promptOverride: regenPrompt.trim() || undefined,
          audioStyle: regenAudioStyle,
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
                  {isVideoSlot && (regenGenerator.startsWith("seedance") || regenGenerator === "kling") && (
                    <div className="flex gap-1 flex-wrap">
                      {(["scene","ambient","dialogue","silent"] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() => setRegenAudioStyle(a)}
                          className={`font-mono text-[8px] uppercase tracking-[0.06em] px-2 py-0.5 border transition-colors ${
                            regenAudioStyle === a ? "border-amber/50 bg-amber/10 text-amber" : "border-border text-muted hover:text-ink"
                          }`}
                        >
                          {a === "scene" ? "🎙 scene" : a === "ambient" ? "🎵 ambient" : a === "dialogue" ? "🗣 dialogue" : "🔇 silent"}
                        </button>
                      ))}
                    </div>
                  )}
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
                        {isVideoSlot ? "Regenerujem video" : "Regenerujem"} · {elapsed}s
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
            {isVideoSlot && (generator.startsWith("seedance") || generator === "kling") && (
              <div className="flex gap-1 flex-wrap">
                {(["scene","ambient","dialogue","silent"] as const).map((a) => (
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
                  {isVideoSlot ? "Generujem video (~2 min)" : generator === "higgsfield" ? "Higgsfield Soul (~2 min)" : "Generujem"} · {elapsed}s
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

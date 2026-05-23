"use client";

import { useState } from "react";
import { Media } from "@/types";

const statusStyles: Record<string, string> = {
  pending:    "bg-surface-high text-muted border-border",
  generating: "bg-amber/10 text-amber border-amber/20 animate-pulse",
  ready:      "bg-teal/10 text-teal border-teal/20",
  posted:     "bg-accent/10 text-accent border-accent/20",
  failed:     "bg-red-500/10 text-red-400 border-red-500/20",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border ${statusStyles[status] ?? statusStyles.pending}`}>
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
  reel_video: "REEL VIDEO",
  story_bts: "STORY · BTS",
};

function formatHintFor(media: Media): string {
  if (media.channel === "reel") return "// 9:16 → Reels / TikTok / Shorts";
  if (media.channel === "story") return "// 9:16 → Instagram Story";
  if (media.channel === "feed") return "// 4:5 → IG Feed carousel";
  return media.type === "photo"
    ? "// aspect_ratio 4:5 → IG Feed"
    : "// aspect_ratio 9:16 → Reels / TikTok / Shorts";
}

export default function MediaCard({ media }: { media: Media }) {
  const isPhoto = media.type === "photo";
  const baseLabel = isPhoto ? "FOTO" : "VIDEO";
  const slotLabel = media.slot ? SLOT_LABELS[media.slot] ?? media.slot.toUpperCase() : null;
  const label = slotLabel ?? baseLabel;
  const model = isPhoto ? "Soul 2" : "Seedance 2.0";
  const formatHint = formatHintFor(media);
  const higgsfieldUrl = isPhoto
    ? "https://higgsfield.ai/character"
    : "https://higgsfield.ai/cinema-studio";

  const [urlInput, setUrlInput] = useState(media.media_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imgError, setImgError] = useState(false);

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
    await navigator.clipboard.writeText(media.higgsfield_prompt);
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
      <div className="bg-[#050709] border border-border p-4 flex flex-col gap-3">
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
      </div>
    );
  }

  // ── ready ─────────────────────────────────────────────────
  if (media.status === "ready") {
    return (
      <div className="bg-[#050709] border border-border hover:border-teal transition-colors p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[8px] tracking-[0.15em] text-muted uppercase mb-0.5">Asset Category</div>
            <div className="font-mono text-[11px] tracking-[0.05em] font-medium text-ink uppercase">{label}</div>
          </div>
          <Badge status={media.status} />
        </div>

        {isPhoto && media.media_url && !imgError && (
          <img
            src={media.media_url}
            alt="Generated"
            className="w-full object-cover max-h-48"
            onError={() => setImgError(true)}
          />
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

        <button
          onClick={approvePost}
          disabled={posting}
          className="w-full font-mono text-[10px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent py-1.5 hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? "Postuje…" : "Označiť ako postnuté"}
        </button>
      </div>
    );
  }

  // ── pending / generating ──────────────────────────────────
  return (
    <div className="bg-[#050709] border border-border hover:border-border2 transition-colors p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[8px] tracking-[0.15em] text-muted uppercase mb-0.5">Asset Category</div>
          <div className="font-mono text-[11px] tracking-[0.05em] font-medium text-ink uppercase">{label}
            <span className="ml-2 text-muted normal-case font-normal text-[9px]">{model}</span>
          </div>
        </div>
        <Badge status={media.status} />
      </div>

      {/* Higgsfield link + format hint */}
      <div>
        <a
          href={higgsfieldUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[9px] bg-amber/10 border border-amber/30 text-amber px-3 py-1 hover:bg-amber/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
          Otvoriť Higgsfield
        </a>
        <p className="font-mono text-[9px] text-muted mt-1.5">{formatHint}</p>
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

      {/* Prompt */}
      <div className="relative">
        <pre className="bg-bg border border-border p-3 font-mono text-[10px] text-teal leading-relaxed whitespace-pre-wrap break-words pr-20 max-h-72 overflow-y-auto">
          {media.higgsfield_prompt}
        </pre>
        <button
          onClick={copyPrompt}
          className="absolute top-2 right-2 font-mono text-[8px] bg-surface border border-border text-muted2 px-2 py-1 hover:text-ink hover:border-border2 transition-colors"
        >
          {copied ? "✓ OK" : "Kopírovať"}
        </button>
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
          <button
            onClick={saveUrl}
            disabled={saving || !urlInput.trim()}
            className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] bg-teal/10 border border-teal/30 text-teal px-3 py-1.5 hover:bg-teal/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saved ? "✓" : saving ? "Ukladám…" : "Uložiť"}
          </button>
        </div>
        {saveError && (
          <p className="font-mono text-[9px] text-red-400">{saveError}</p>
        )}
      </div>
    </div>
  );
}

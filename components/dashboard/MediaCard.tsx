"use client";

import { useState } from "react";
import { Media } from "@/types";

const statusStyles: Record<string, string> = {
  pending: "bg-border text-muted2 border-border2",
  generating: "bg-amber/10 text-amber border-amber/20 animate-pulse",
  ready: "bg-teal/10 text-teal border-teal/20",
  posted: "bg-accent/10 text-accent border-accent/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`font-mono text-[8px] tracking-wider px-2 py-0.5 border rounded-sm ${statusStyles[status] ?? statusStyles.pending}`}>
      {status.toUpperCase()}
    </span>
  );
}

interface Props {
  media: Media;
}

export default function MediaCard({ media }: Props) {
  const isPhoto = media.type === "photo";
  const label = isPhoto ? "FOTO" : "VIDEO";
  const model = isPhoto ? "Seedance 2.0" : "Cinema Studio 3.5";
  const higgsfieldUrl = isPhoto
    ? "https://higgsfield.ai/character"
    : "https://higgsfield.ai/cinema-studio";

  const [urlInput, setUrlInput] = useState(media.media_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [posting, setPosting] = useState(false);
  const [imgError, setImgError] = useState(false);

  async function saveUrl() {
    if (!urlInput.trim()) return;
    setSaving(true);
    await fetch("/api/characters/save-media-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: media.id, url: urlInput.trim() }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => window.location.reload(), 600);
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
      <div className="bg-bg3 border border-border rounded-md p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted2 uppercase tracking-wider">{label}</span>
            <span className="font-mono text-[8px] text-muted">{model}</span>
          </div>
          <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 rounded-sm tracking-wider">
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
      <div className="bg-bg3 border border-border rounded-md p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted2 uppercase tracking-wider">{label}</span>
            <span className="font-mono text-[8px] text-muted">{model}</span>
          </div>
          <Badge status={media.status} />
        </div>

        {isPhoto && media.media_url && !imgError && (
          <img
            src={media.media_url}
            alt="Generated"
            className="w-full rounded border border-border object-cover max-h-48"
            onError={() => setImgError(true)}
          />
        )}
        {isPhoto && media.media_url && imgError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-bg border border-border rounded">
            <span className="font-mono text-[8px] bg-teal/10 border border-teal/20 text-teal px-1.5 py-0.5 rounded-sm">✓</span>
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
          className="w-full font-mono text-[10px] bg-accent/10 border border-accent/30 text-accent py-1.5 rounded hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? "Postuje…" : "Schváliť posting"}
        </button>
      </div>
    );
  }

  // ── pending / generating ──────────────────────────────────
  return (
    <div className="bg-bg3 border border-border rounded-md p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-muted2 uppercase tracking-wider">{label}</span>
          <span className="font-mono text-[8px] text-muted">{model}</span>
        </div>
        <Badge status={media.status} />
      </div>

      {/* Higgsfield link */}
      <a
        href={higgsfieldUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start font-mono text-[9px] bg-amber/10 border border-amber/30 text-amber px-3 py-1 rounded hover:bg-amber/20 transition-colors"
      >
        Otvoriť Higgsfield ↗
      </a>

      {/* Prompt + copy */}
      <div className="relative">
        <pre className="bg-bg border border-border rounded p-3 font-mono text-[10px] text-ink leading-relaxed whitespace-pre-wrap break-words pr-20 max-h-44 overflow-y-auto">
          {media.higgsfield_prompt}
        </pre>
        <button
          onClick={copyPrompt}
          className="absolute top-2 right-2 font-mono text-[8px] bg-bg2 border border-border text-muted2 px-2 py-1 rounded hover:text-ink hover:border-border2 transition-colors"
        >
          {copied ? "✓ OK" : "Kopírovať"}
        </button>
      </div>

      {/* URL input + save */}
      <div className="flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveUrl()}
          placeholder="Vlož URL z Higgsfield..."
          className="flex-1 min-w-0 bg-bg border border-border rounded px-3 py-1.5 font-mono text-[10px] text-ink placeholder:text-muted focus:outline-none focus:border-border2 transition-colors"
        />
        <button
          onClick={saveUrl}
          disabled={saving || !urlInput.trim()}
          className="flex-shrink-0 font-mono text-[10px] bg-teal/10 border border-teal/30 text-teal px-3 py-1.5 rounded hover:bg-teal/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saved ? "✓" : saving ? "Ukladám…" : "Uložiť"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

// One-click copy chip — the whole label + text block is the button; click copies
// `value` to the clipboard and flips to a ✓ confirmation for ~2s. `display` lets
// us copy a different (fuller) string than what is shown (e.g. caption+hashtags).
function CopyField({
  label,
  value,
  display,
  accent = "ink",
}: {
  label: string;
  value: string;
  display?: string;
  accent?: "ink" | "teal" | "amber";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable (insecure context) — no-op */
    }
  };
  return (
    <button
      onClick={copy}
      title="Klikni pre skopírovanie"
      className="group w-full text-left bg-bg border border-border hover:border-border2 transition-colors p-2.5 flex flex-col gap-1"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">{label}</span>
        <span className={`font-mono text-[8px] uppercase tracking-[0.1em] flex-shrink-0 ${copied ? "text-teal" : "text-muted2 group-hover:text-ink"}`}>
          {copied ? "✓ skopírované" : "kopírovať"}
        </span>
      </span>
      <span className={`font-mono text-[10px] whitespace-pre-wrap break-words leading-relaxed ${
        accent === "teal" ? "text-teal" : accent === "amber" ? "text-amber" : "text-ink"
      }`}>
        {display ?? value}
      </span>
    </button>
  );
}

// Per-day publish text: the exact strings to paste into Instagram. Reel overlay
// (on-screen text hook), IG caption, hashtags, and a combined caption+hashtags
// for a single paste. All one-click copy — no more digging in the DB.
export default function PublishText({
  caption,
  overlay,
  hashtags,
}: {
  caption?: string | null;
  overlay?: string | null;
  hashtags?: string[] | null;
}) {
  const cap = caption?.trim() ?? "";
  const hook = overlay?.trim() ?? "";
  const tags = (hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  const combined = [cap, tags].filter(Boolean).join("\n\n");
  if (!cap && !hook && !tags) return null;

  return (
    <div className="pt-4 border-t border-border">
      <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">// Publikačný text — klik = kopírovať</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {hook && <CopyField label="Reel overlay (na video)" value={hook} accent="amber" />}
        {cap && <CopyField label="IG caption" value={cap} />}
        {tags && <CopyField label="Hashtagy" value={tags} accent="teal" />}
        {cap && tags && (
          <CopyField label="Caption + hashtagy (1 paste)" value={combined} display={`${cap}\n\n${tags}`} />
        )}
      </div>
    </div>
  );
}

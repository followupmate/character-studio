"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";

/* ─── Lightbox ───────────────────────────────────────────────── */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="relative max-w-4xl max-h-[90vh] w-full h-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Preview"
            className="w-full h-full object-contain"
          />
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-black/60 text-white w-8 h-8 flex items-center justify-center hover:bg-black/80 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Types ──────────────────────────────────────────────────── */
interface Media {
  id: string;
  slot: string;
  type: string;
  channel: string;
  sequence_index: number | null;
  media_url: string | null;
  thumbnail_url: string | null;
  generation_status: string | null;
  hook_text: string | null;
  shot_archetype: string | null;
}

interface StoryDay {
  id: string;
  ig_caption: string | null;
  hashtags: string[] | null;
  narrative: string | null;
  location: string | null;
  mood: string | null;
  tier: string | null;
  arc_position: string | null;
  emotional_beat: string | null;
  next_hint: string | null;
}

interface Character {
  id: string;
  name: string;
  photo_url: string | null;
  posting_time: string;
  platforms: string[];
}

interface ExistingPost {
  id: string;
  post_type: string;
  status: string;
}

interface Batch {
  plan: { id: string; date: string; batch_status: string };
  character: Character;
  storyDay: StoryDay;
  media: Media[];
  existingPosts: ExistingPost[];
}

/* ─── Helpers ────────────────────────────────────────────────── */
const SLOT_LABELS: Record<string, string> = {
  carousel_1: "Slide 1",
  carousel_2: "Slide 2",
  carousel_3: "Slide 3",
  carousel_4: "Slide 4",
  carousel_5: "Slide 5",
  reel_start_frame: "Reel frame",
  reel_video: "Reel video",
  story_bts: "Story",
};

const SLOT_ORDER = [
  "carousel_1","carousel_2","carousel_3","carousel_4","carousel_5",
  "reel_start_frame","reel_video","story_bts",
];

const arcColors: Record<string, string> = {
  opening: "text-teal border-teal/30",
  rising:  "text-accent border-accent/30",
  peak:    "text-amber border-amber/30",
  turning: "text-amber border-amber/30",
  falling: "text-muted2 border-border2",
  quiet:   "text-muted2 border-border2",
};

function statusBadge(gen: string | null) {
  if (gen === "completed") return { label: "READY",      cls: "bg-teal/10 text-teal border-teal/20" };
  if (gen === "pending")   return { label: "PENDING",    cls: "bg-surface-high text-muted border-border" };
  if (gen === "generating")return { label: "GENERATING", cls: "bg-accent/10 text-accent border-accent/20" };
  if (gen === "failed")    return { label: "FAILED",     cls: "bg-amber/10 text-amber border-amber/20" };
  return                          { label: "–",          cls: "bg-surface-high text-muted border-border" };
}

/* ─── MediaSlot ──────────────────────────────────────────────── */
function MediaSlot({ media, label, onZoom }: { media: Media | undefined; label: string; onZoom?: (url: string) => void }) {
  const [imgErr, setImgErr] = useState(false);
  const badge = statusBadge(media?.generation_status ?? null);
  const hasImage = !!media?.media_url && !imgErr && media.type !== "video";
  const isVideo = media?.type === "video";

  return (
    <div className="bg-bg3 border border-border flex flex-col overflow-hidden">
      {/* Thumbnail */}
      <div className="aspect-[4/5] bg-bg relative overflow-hidden group">
        {hasImage ? (
          <>
            <Image
              src={media!.media_url!}
              alt={label}
              fill
              className="object-cover"
              sizes="160px"
              onError={() => setImgErr(true)}
              unoptimized
            />
            <button
              onClick={() => onZoom?.(media!.media_url!)}
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
              title="Zväčšiť"
            >
              <span className="material-symbols-outlined text-[24px] text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">
                zoom_in
              </span>
            </button>
          </>
        ) : isVideo && media?.media_url ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="material-symbols-outlined text-[28px] text-accent/60">play_circle</span>
            <span className="font-mono text-[8px] text-muted uppercase">Video</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px] text-border2">image</span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
        <span className="font-mono text-[8px] text-muted uppercase truncate">{label}</span>
        <span className={`font-mono text-[7px] tracking-[0.08em] px-1.5 py-0.5 border ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {media?.hook_text && (
        <div className="px-2 pb-1.5">
          <p className="font-mono text-[7px] text-muted2 italic truncate">&ldquo;{media.hook_text}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

/* ─── ReviewBatchCard ────────────────────────────────────────── */
function ReviewBatchCard({ batch, onApprove, onSkip }: {
  batch: Batch;
  onApprove: (storyDayId: string, characterId: string, date: string, caption: string, hashtags: string) => Promise<void>;
  onSkip: (storyDayId: string) => void;
}) {
  const { character, storyDay, media, existingPosts, plan } = batch;

  const [caption, setCaption]       = useState(storyDay.ig_caption ?? "");
  const [hashtags, setHashtags]     = useState((storyDay.hashtags ?? []).join(" "));
  const [storyOpen, setStoryOpen]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const arcCls = arcColors[storyDay.arc_position ?? ""] ?? "text-muted2 border-border2";
  const alreadyQueued = existingPosts.length > 0;

  const readyCount = media.filter((m) => m.generation_status === "completed" && m.media_url).length;
  const totalCount = media.length;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(storyDay.id, character.id, plan.date, caption, hashtags);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="bg-bg2 border border-border"
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-border">
        {character.photo_url ? (
          <div className="relative w-10 h-10 flex-shrink-0 overflow-hidden">
            <Image src={character.photo_url} alt={character.name} fill className="object-cover grayscale" unoptimized />
          </div>
        ) : (
          <div className="w-10 h-10 flex-shrink-0 bg-bg3 border border-border flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px] text-muted">person</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display italic text-lg text-white">{character.name}</span>
            {storyDay.arc_position && (
              <span className={`font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border uppercase ${arcCls}`}>
                {storyDay.arc_position}
              </span>
            )}
            {storyDay.tier && (
              <span className="font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border border-border text-muted uppercase">
                {storyDay.tier.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="font-mono text-[9px] text-muted">{plan.date}</span>
            <span className="font-mono text-[9px] text-muted">
              {readyCount}/{totalCount} slotov ready
            </span>
            {alreadyQueued && (
              <span className="font-mono text-[8px] text-teal border border-teal/20 bg-teal/10 px-1.5 py-0.5 uppercase tracking-[0.08em]">
                Naplánované
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setStoryOpen((v) => !v)}
          className="text-muted hover:text-ink transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">
            {storyOpen ? "expand_less" : "expand_more"}
          </span>
        </button>
      </div>

      {/* Story detail (collapsible) */}
      <AnimatePresence>
        {storyOpen && (
          <motion.div
            key="story"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-b border-border"
          >
            <div className="px-5 py-4 space-y-2">
              <div className="flex gap-4 text-[10px] font-mono text-muted2">
                {storyDay.location && <span><span className="text-muted">Lokácia: </span>{storyDay.location}</span>}
                {storyDay.mood     && <span><span className="text-muted">Mood: </span>{storyDay.mood}</span>}
              </div>
              {storyDay.narrative && (
                <p className="text-sm text-muted2 italic leading-relaxed border-l-2 border-border pl-3">
                  {storyDay.narrative}
                </p>
              )}
              {storyDay.emotional_beat && (
                <p className="font-mono text-[9px] text-accent">{storyDay.emotional_beat}</p>
              )}
              {storyDay.next_hint && (
                <p className="font-mono text-[9px] text-muted bg-bg3 border border-border px-3 py-2">
                  <span className="text-muted/60 mr-1">→</span>{storyDay.next_hint}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media grid */}
      <div className="px-5 py-4 border-b border-border">
        <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-3">Médiá</p>
        {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-px bg-border">
          {SLOT_ORDER.map((slot) => (
            <MediaSlot
              key={slot}
              media={media.find((m) => m.slot === slot)}
              label={SLOT_LABELS[slot] ?? slot}
              onZoom={setLightboxUrl}
            />
          ))}
        </div>
      </div>

      {/* Caption editor */}
      <div className="px-5 py-4 border-b border-border space-y-3">
        <p className="font-mono text-[9px] tracking-widest text-muted uppercase">Caption & Hashtags</p>

        <div className="space-y-1">
          <label className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">Caption</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full bg-bg3 border border-border text-ink text-sm px-3 py-2 resize-none font-sans placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
            placeholder="Napíš caption pre Instagram..."
          />
        </div>

        <div className="space-y-1">
          <label className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">
            Hashtags <span className="text-muted/60">(oddelené medzerou)</span>
          </label>
          <input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            type="text"
            className="w-full bg-bg3 border border-border text-ink text-xs px-3 py-2 font-mono placeholder:text-muted focus:outline-none focus:border-accent/50 transition-colors"
            placeholder="#lifestyle #aesthetic #model"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-3 justify-end">
        <motion.button
          onClick={() => onSkip(storyDay.id)}
          className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted hover:text-ink border border-border px-4 py-2 transition-colors"
          whileHover={{ borderColor: "rgba(255,255,255,0.2)" }}
          whileTap={{ scale: 0.97 }}
        >
          Preskočiť
        </motion.button>

        {alreadyQueued ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-teal border border-teal/20 bg-teal/10 px-4 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            Naplánované
          </div>
        ) : (
          <motion.button
            onClick={handleApprove}
            disabled={loading}
            className="font-mono text-[10px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            whileHover={!loading ? { backgroundColor: "rgba(74,158,255,0.2)" } : {}}
            whileTap={!loading ? { scale: 0.97 } : {}}
          >
            {loading ? (
              <>
                <motion.span
                  className="w-2.5 h-2.5 border border-accent/60 border-t-accent rounded-full inline-block"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                />
                Spracovávam…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[13px]">schedule_send</span>
                Schváliť &amp; naplánovať
              </>
            )}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Notification ───────────────────────────────────────────── */
function Notification({ msg, type, onDismiss }: { msg: string; type: "success" | "error"; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 border font-mono text-[10px] uppercase tracking-[0.05em] ${
        type === "success"
          ? "bg-teal/10 border-teal/30 text-teal"
          : "bg-amber/10 border-amber/30 text-amber"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">
        {type === "success" ? "check_circle" : "error"}
      </span>
      {msg}
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </motion.div>
  );
}

/* ─── Main ReviewClient ──────────────────────────────────────── */
export default function ReviewClient({ batches: initialBatches, today }: {
  batches: Batch[];
  today: string;
}) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const visibleBatches = batches.filter((b) => !skipped.has(b.storyDay.id));
  const pendingCount = visibleBatches.filter((b) => b.existingPosts.length === 0).length;

  const showNotif = (msg: string, type: "success" | "error") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleApprove = async (
    storyDayId: string,
    characterId: string,
    date: string,
    caption: string,
    hashtags: string
  ) => {
    const res = await fetch("/api/review/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyDayId, characterId, date, caption, hashtags }),
    });

    const data = await res.json();

    if (!res.ok) {
      showNotif(data.error ?? "Chyba pri schvaľovaní", "error");
      return;
    }

    // Mark as queued in local state
    setBatches((prev) =>
      prev.map((b) =>
        b.storyDay.id === storyDayId
          ? {
              ...b,
              storyDay: { ...b.storyDay, ig_caption: caption },
              existingPosts: [
                ...b.existingPosts,
                ...(data.created ?? []).map((c: any) => ({ id: c.post_id, post_type: c.post_type, status: "scheduled" })),
              ],
            }
          : b
      )
    );

    const count = data.created?.length ?? 0;
    showNotif(`${count} post${count !== 1 ? "y" : ""} naplánované`, "success");
  };

  const handleSkip = (storyDayId: string) => {
    setSkipped((prev) => new Set([...prev, storyDayId]));
  };

  return (
    <>
      <AnimatePresence>
        {notification && (
          <Notification
            key="notif"
            msg={notification.msg}
            type={notification.type}
            onDismiss={() => setNotification(null)}
          />
        )}
      </AnimatePresence>

      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.1em] text-white">Review Queue</h1>
          {pendingCount > 0 && (
            <span className="font-mono text-[8px] px-2 py-0.5 bg-amber/10 text-amber border border-amber/20 uppercase tracking-[0.08em]">
              {pendingCount} čakajú
            </span>
          )}
        </div>
        <span className="font-mono text-[9px] text-muted">{today}</span>
      </div>

      {/* Content */}
      <div className="px-4 lg:px-8 py-6 space-y-4 max-w-5xl">

        {/* Empty state */}
        {visibleBatches.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-20 text-center"
          >
            <span className="material-symbols-outlined text-[48px] text-border2 block mb-4">done_all</span>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Nič na review</p>
            <p className="font-mono text-[9px] text-muted/60 mt-1">
              Batche sú buď naplánované, alebo dnes ešte nie sú ready.
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {visibleBatches.map((batch) => (
            <ReviewBatchCard
              key={batch.storyDay.id}
              batch={batch}
              onApprove={handleApprove}
              onSkip={handleSkip}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

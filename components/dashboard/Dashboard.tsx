"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useMotionValue, useSpring, AnimatePresence } from "motion/react";
import { Character, StoryDay, Media, TopPostSummary } from "@/types";
import { deriveStrategy, FanvueSnapshot } from "@/lib/fanvueStrategy";
import { slotShort } from "@/lib/slots";

interface Props {
  characters: Character[];
  todayStories: (StoryDay & { chs_media: Media[] })[];
  photoMap: Record<string, string>;
  topPosts?: TopPostSummary[];
}

function uptimeHours(createdAt: string): string {
  const h = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000);
  return h.toLocaleString("sk-SK") + "H";
}

function charType(platforms: string[]): string {
  if (platforms.includes("youtube") && platforms.includes("instagram")) return "MULTI_PLATFORM";
  if (platforms.includes("youtube")) return "VIDEO_ARCH";
  if (platforms.includes("tiktok")) return "SHORT_FORM";
  return "CONTENT_LEAD";
}

const VISUAL_TONES = [
  { key: "luxury",     label: "Luxury" },
  { key: "sexy",       label: "Sexi" },
  { key: "playful",    label: "Hravý" },
  { key: "mysterious", label: "Tajomný" },
] as const;
type VisualTone = typeof VISUAL_TONES[number]["key"];

function parseTones(s: string | null): VisualTone[] {
  const known = VISUAL_TONES.map(t => t.key);
  return (s ?? "").split(",").map(t => t.trim().toLowerCase()).filter((t): t is VisualTone => known.includes(t as VisualTone));
}

// Animated number counter
function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const t = setTimeout(() => {
      motionVal.set(value);
    }, 200);
    return () => clearTimeout(t);
  }, [value, motionVal]);

  useEffect(() => {
    return spring.on("change", (v) => setDisplay(Math.round(v)));
  }, [spring]);

  return <span className={className}>{display}</span>;
}

// Border + dot colour per media status for the outputs gallery
function outputStatusClasses(m: Media): { border: string; dot: string; pulse: boolean } {
  if (m.status === "posted")  return { border: "border-accent/50", dot: "bg-accent", pulse: false };
  if (m.media_url)            return { border: "border-teal/40",   dot: "bg-teal",   pulse: false };
  if (m.generation_status === "generating" || m.generation_status === "retrying")
    return { border: "border-amber/50", dot: "bg-amber", pulse: true };
  if (m.generation_status === "failed")
    return { border: "border-red-500/40", dot: "bg-red-400", pulse: false };
  return { border: "border-border", dot: "bg-muted", pulse: false };
}

function OutputThumb({ media }: { media: Media }) {
  const { border, dot, pulse } = outputStatusClasses(media);
  const slotLabel = slotShort(media.slot, media.type.toUpperCase());
  const isVideo = media.type === "video";

  const inner = media.media_url ? (
    isVideo ? (
      <>
        <video
          src={media.media_url}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
        <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-[26px] text-white/80 drop-shadow-lg pointer-events-none">
          play_circle
        </span>
      </>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={media.media_url} alt={slotLabel} className="w-full h-full object-cover" loading="lazy" />
    )
  ) : (
    <span className="material-symbols-outlined text-[22px] text-muted/40">
      {media.generation_status === "failed" ? "error" : isVideo ? "movie" : "image"}
    </span>
  );

  const frame = (
    <motion.div
      className={`relative w-24 flex-shrink-0 overflow-hidden bg-surface-low border ${border} ${media.media_url ? "" : "border-dashed"} flex items-center justify-center group`}
      style={{ aspectRatio: "4/5" }}
      whileHover={media.media_url ? { scale: 1.03 } : {}}
      transition={{ duration: 0.15 }}
    >
      {inner}
      {/* Slot label + status dot */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3 flex items-center justify-between">
        <span className="font-mono text-[8px] tracking-[0.08em] text-white/90">{slotLabel}</span>
        <motion.span
          className={`w-1.5 h-1.5 rounded-full ${dot}`}
          animate={pulse ? { opacity: [1, 0.25, 1] } : {}}
          transition={pulse ? { duration: 1.2, repeat: Infinity } : {}}
        />
      </div>
    </motion.div>
  );

  return media.media_url ? (
    <a href={media.media_url} target="_blank" rel="noopener noreferrer" title={`${slotLabel} — otvoriť`}>
      {frame}
    </a>
  ) : (
    <div title={`${slotLabel} — ${media.generation_status ?? media.status}`}>{frame}</div>
  );
}

function TodayOutputs({
  todayStories,
  characters,
}: {
  todayStories: (StoryDay & { chs_media: Media[] })[];
  characters: Character[];
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));

  return (
    <motion.div
      className="mb-10"
      variants={fadeUpVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: 0.15 }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">// Dnešné výstupy</p>
        <motion.a
          href="/today"
          className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent hover:text-white transition-colors"
          whileHover={{ x: 2 }}
        >
          Otvoriť deň →
        </motion.a>
      </div>

      {todayStories.length === 0 ? (
        <div className="bg-surface border border-border border-dashed p-8 text-center">
          <p className="font-mono text-[11px] text-muted2 mb-1">Dnes zatiaľ žiadne výstupy</p>
          <p className="font-mono text-[9px] text-muted">
            Cron generuje o 6:00 UTC — alebo použi „Generuj príbeh“ nižšie.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-border border border-border">
          {todayStories.map((story) => {
            const char = charById.get(story.character_id);
            const sorted = [...story.chs_media].sort((a, b) => {
              const ai = a.sequence_index ?? 99;
              const bi = b.sequence_index ?? 99;
              if (ai !== bi) return ai - bi;
              return (a.slot ?? "").localeCompare(b.slot ?? "");
            });
            const done = sorted.filter((m) => m.media_url).length;

            return (
              <div key={story.id} className="bg-surface p-4">
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-display italic text-[16px] text-white leading-none">
                      {char?.name ?? "Unknown"}
                    </span>
                    <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 tracking-[0.1em]">
                      DAY {story.day_number}
                    </span>
                    <span className="font-mono text-[9px] text-muted truncate hidden sm:inline">
                      📍 {story.location}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-mono text-[9px] ${done === sorted.length && sorted.length > 0 ? "text-teal" : "text-muted2"}`}>
                      {done}/{sorted.length} hotových
                    </span>
                    <a
                      href={`/today?char=${story.character_id}`}
                      className="font-mono text-[9px] text-accent hover:text-white transition-colors"
                    >
                      Detail →
                    </a>
                  </div>
                </div>
                {sorted.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {sorted.map((m) => (
                      <OutputThumb key={m.id} media={m} />
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[9px] text-muted">Príbeh existuje, médiá ešte neboli naplánované.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  pre_launch: "PRE-LAUNCH",
  growth_first: "GROWTH",
  early_monetize: "MONETIZE",
  scale: "SCALE",
};

// Money view — Fanvue revenue snapshot + best-performing posts. Read-only:
// snapshot comes from chs_characters.fanvue_snapshot, scores from the daily
// import-insights cron. This is the "does it make money?" panel.
function MoneyStrip({
  characters,
  topPosts,
}: {
  characters: Character[];
  topPosts: TopPostSummary[];
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const withSnapshot = characters.filter((c) => c.is_active && c.fanvue_snapshot);

  return (
    <motion.div
      className="mb-10"
      variants={fadeUpVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: 0.18 }}
    >
      <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-3">// Money Engine</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border border border-border">
        {/* Fanvue revenue */}
        <div className="bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[8px] border border-accent/30 bg-accent/5 text-accent px-2 py-0.5 uppercase tracking-[0.1em]">Fanvue</span>
            <a href="/fanvue" className="font-mono text-[9px] text-accent hover:text-white transition-colors">Detail →</a>
          </div>
          {withSnapshot.length === 0 ? (
            <div className="py-4">
              <p className="font-mono text-[11px] text-muted2 mb-1.5">Žiadny Fanvue audit</p>
              <p className="font-mono text-[9px] text-muted leading-relaxed">
                Earnings a subscribers sa zobrazia po prvom audite — spusti ho na <a href="/fanvue" className="text-accent hover:underline">/fanvue</a>.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {withSnapshot.map((c) => {
                const s = c.fanvue_snapshot as FanvueSnapshot;
                const strategy = deriveStrategy(s);
                return (
                  <div key={c.id}>
                    <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                      <span className="font-display italic text-[15px] text-white leading-none">{c.name}</span>
                      {strategy && (
                        <span className="font-mono text-[8px] bg-teal/10 border border-teal/30 text-teal px-1.5 py-0.5 tracking-[0.1em]">
                          {PHASE_LABELS[strategy.phase] ?? strategy.phase.toUpperCase()}
                        </span>
                      )}
                      {s.audited_at && (
                        <span className="font-mono text-[8px] text-muted">
                          audit {new Date(s.audited_at).toLocaleDateString("sk-SK")}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-px bg-border">
                      <div className="bg-surface-low p-3">
                        <div className="font-mono text-[8px] text-muted uppercase tracking-[0.1em] mb-1">Earnings</div>
                        <div className="font-display text-[24px] leading-none text-teal">
                          {(s.earnings_total ?? 0).toLocaleString("sk-SK")}<span className="text-[13px] text-teal/70"> €</span>
                        </div>
                      </div>
                      <div className="bg-surface-low p-3">
                        <div className="font-mono text-[8px] text-muted uppercase tracking-[0.1em] mb-1">Subscribers</div>
                        <div className="font-display text-[24px] leading-none text-white">{s.subscribers ?? 0}</div>
                      </div>
                      <div className="bg-surface-low p-3">
                        <div className="font-mono text-[8px] text-muted uppercase tracking-[0.1em] mb-1">Followers</div>
                        <div className="font-display text-[24px] leading-none text-white">{s.followers ?? 0}</div>
                      </div>
                    </div>
                    {strategy && (
                      <p className="font-mono text-[9px] text-muted2 mt-2 leading-relaxed">{strategy.headline}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top performing posts */}
        <div className="bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[8px] border border-amber/30 bg-amber/5 text-amber px-2 py-0.5 uppercase tracking-[0.1em]">Top výstupy · 14 dní</span>
            <a href="/growth" className="font-mono text-[9px] text-accent hover:text-white transition-colors">Growth →</a>
          </div>
          {topPosts.length === 0 ? (
            <div className="py-4">
              <p className="font-mono text-[11px] text-muted2 mb-1.5">Žiadne skórované posty</p>
              <p className="font-mono text-[9px] text-muted leading-relaxed">
                IG metriky sa importujú automaticky každý deň o 20:00 UTC (cron <span className="text-ink">import-insights</span>).
                Skóre sa objaví deň po prvom publikovanom poste.
              </p>
            </div>
          ) : (
            <div className="space-y-px">
              {topPosts.map((p, i) => {
                const char = p.character_id ? charById.get(p.character_id) : undefined;
                const e = p.engagement ?? {};
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-surface-low px-3 py-2">
                    <span className="font-mono text-[10px] text-muted w-4 flex-shrink-0">{i + 1}.</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-ink flex-shrink-0">{p.post_type}</span>
                    {p.growth_winner && <span className="text-[10px] flex-shrink-0" title="Growth winner">🏆</span>}
                    <span className="font-mono text-[9px] text-muted truncate">
                      {char?.name ?? ""}{p.posted_at ? ` · ${new Date(p.posted_at).toLocaleDateString("sk-SK")}` : ""}
                    </span>
                    <span className="font-mono text-[9px] text-muted2 ml-auto flex-shrink-0 hidden sm:inline">
                      {e.views ? `${e.views.toLocaleString("sk-SK")} views · ` : ""}
                      {e.follows ? `+${e.follows} follows · ` : ""}
                      {e.fanvue_clicks ? `${e.fanvue_clicks} FV clicks · ` : ""}
                    </span>
                    <span className="font-mono text-[11px] text-amber flex-shrink-0">{Math.round(Number(p.growth_score))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const gridContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const gridItemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

const fadeUpVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function CharacterCard({
  char,
  photoUrl,
  onDelete,
  deletingId,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  char: Character;
  photoUrl?: string;
  onDelete: (id: string) => void;
  deletingId: string | null;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
}) {
  const effectivePhoto = char.photo_url ?? photoUrl;
  const [imgErr, setImgErr] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [photoInput, setPhotoInput] = useState(char.photo_url ?? "");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [selectedTones, setSelectedTones] = useState<VisualTone[]>(() => parseTones(char.visual_tone));
  const [savingTone, setSavingTone] = useState(false);
  const [editingStyling, setEditingStyling] = useState(false);
  const [stylingInput, setStylingInput] = useState(char.styling_note ?? "");
  const [savingStyling, setSavingStyling] = useState(false);
  const [savingDoctrine, setSavingDoctrine] = useState(false);
  const [discoveryOn, setDiscoveryOn] = useState<boolean>(!!char.feature_flags?.discovery_mode);
  const [savingDiscovery, setSavingDiscovery] = useState(false);

  async function toggleDiscovery() {
    const next = !discoveryOn;
    setDiscoveryOn(next);
    setSavingDiscovery(true);
    await fetch("/api/characters/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: char.id, feature_flag: { flag: "discovery_mode", value: next } }),
    });
    setSavingDiscovery(false);
  }

  async function savePhoto() {
    setSavingPhoto(true);
    await fetch("/api/characters/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: char.id, photo_url: photoInput.trim() || null }),
    });
    setSavingPhoto(false);
    setEditingPhoto(false);
    window.location.reload();
  }

  async function saveStyling() {
    setSavingStyling(true);
    await fetch("/api/characters/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: char.id, styling_note: stylingInput.trim() || null }),
    });
    setSavingStyling(false);
    setEditingStyling(false);
  }

  async function toggleTone(tone: VisualTone) {
    const next = selectedTones.includes(tone)
      ? selectedTones.filter(t => t !== tone)
      : [...selectedTones, tone];
    setSelectedTones(next);
    setSavingTone(true);
    await fetch("/api/characters/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: char.id, visual_tone: next.join(", ") || null }),
    });
    setSavingTone(false);
  }

  return (
    <motion.div
      variants={gridItemVariants}
      className="bg-surface border border-border flex flex-col group cursor-default"
      whileHover={{ borderColor: "rgba(74,158,255,0.35)" }}
      transition={{ duration: 0.2 }}
    >
      {/* Portrait image */}
      <div className="relative overflow-hidden bg-surface-low" style={{ aspectRatio: "3/4" }}>
        {effectivePhoto && !imgErr ? (
          <motion.img
            src={effectivePhoto}
            alt={char.name}
            className="w-full h-full object-cover"
            style={{ filter: "grayscale(100%)" }}
            whileHover={{ filter: "grayscale(0%)", scale: 1.05 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[48px] text-muted/30">person</span>
          </div>
        )}
        {/* Edit photo button */}
        <motion.button
          onClick={() => { setEditingPhoto(true); setImgErr(false); }}
          className="absolute top-2.5 right-2.5 bg-surface/80 border border-border p-1 text-muted"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1, borderColor: "rgba(74,158,255,0.6)", color: "#4a9eff" }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          title="Zmeniť foto"
          style={{ opacity: undefined }}
        >
          <span className="material-symbols-outlined text-[14px]">photo_camera</span>
        </motion.button>
        {/* Active badge */}
        <div className="absolute top-2.5 left-2.5">
          <span className={`font-mono text-[8px] tracking-[0.1em] px-2 py-0.5 border flex items-center gap-1.5 ${
            char.is_active
              ? "bg-teal/10 border-teal/30 text-teal"
              : "bg-surface/80 border-border text-muted"
          }`}>
            <motion.span
              className={`w-1.5 h-1.5 rounded-full inline-block ${char.is_active ? "bg-teal" : "bg-muted"}`}
              animate={char.is_active ? { opacity: [1, 0.3, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {char.is_active ? "ACTIVE" : "PAUSED"}
          </span>
        </div>
      </div>

      {/* Photo URL edit overlay */}
      <AnimatePresence>
        {editingPhoto && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-surface-low border-b border-border flex flex-col gap-2">
              <p className="font-mono text-[8px] text-muted uppercase tracking-[0.1em]">URL fotky</p>
              <input
                type="url"
                value={photoInput}
                onChange={(e) => setPhotoInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && savePhoto()}
                placeholder="https://..."
                className="form-input-base w-full text-[10px]"
                autoFocus
              />
              <div className="flex gap-1.5">
                <button
                  onClick={savePhoto}
                  disabled={savingPhoto}
                  className="flex-1 font-mono text-[8px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent py-1 hover:bg-accent/20 transition-colors disabled:opacity-50"
                >{savingPhoto ? "Ukladám..." : "Uložiť"}</button>
                <button
                  onClick={() => setEditingPhoto(false)}
                  className="font-mono text-[8px] uppercase tracking-[0.05em] border border-border text-muted px-3 py-1 hover:text-ink transition-colors"
                >Zrušiť</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="font-display italic text-[22px] leading-none text-white mb-1.5">{char.name}</div>
          <p className="font-mono text-[9px] text-muted2 leading-relaxed line-clamp-2">
            {char.visual_brief || char.backstory}
          </p>
        </div>

        {/* Styling */}
        <div className="border border-border bg-surface-low px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase">Styling</span>
            <button
              onClick={() => { setEditingStyling(v => !v); setStylingInput(char.styling_note ?? ""); }}
              className="font-mono text-[8px] text-muted hover:text-accent transition-colors"
            >
              <span className="material-symbols-outlined text-[11px]">edit</span>
            </button>
          </div>
          <AnimatePresence mode="wait">
            {editingStyling ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-1.5 mt-1"
              >
                <textarea
                  value={stylingInput}
                  onChange={(e) => setStylingInput(e.target.value)}
                  placeholder="sleek updo, silk dress, pearl earrings..."
                  rows={2}
                  className="form-input-base w-full text-[10px] resize-none"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={saveStyling}
                    disabled={savingStyling}
                    className="flex-1 font-mono text-[8px] uppercase tracking-[0.05em] bg-accent/10 border border-accent/30 text-accent py-1 hover:bg-accent/20 transition-colors disabled:opacity-50"
                  >{savingStyling ? "Ukladám..." : "Uložiť"}</button>
                  <button
                    onClick={() => setEditingStyling(false)}
                    className="font-mono text-[8px] uppercase tracking-[0.05em] border border-border text-muted px-3 py-1 hover:text-ink transition-colors"
                  >Zrušiť</button>
                </div>
              </motion.div>
            ) : (
              <motion.p
                key="display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="font-mono text-[9px] text-muted2 italic leading-relaxed"
              >
                {char.styling_note || <span className="text-muted/50">— nenastavený —</span>}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Visual Tone */}
        <div className="border border-border bg-surface-low px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase">Visual Tone</span>
            {savingTone && <span className="font-mono text-[8px] text-muted">Ukladám...</span>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {VISUAL_TONES.map(({ key, label }) => {
              const active = selectedTones.includes(key);
              return (
                <motion.button
                  key={key}
                  disabled={savingTone}
                  onClick={() => toggleTone(key)}
                  className={`flex-1 font-mono text-[8px] uppercase tracking-[0.05em] border py-1 transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-teal/10 border-teal/40 text-teal"
                      : "border-border text-muted"
                  }`}
                  whileHover={{ color: active ? undefined : "#e2e2ea", borderColor: active ? undefined : "#414752" }}
                  whileTap={{ scale: 0.95 }}
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Prompt Doctrine */}
        <div className="border border-border bg-surface-low px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase">Prompt Doctrine</span>
            {savingDoctrine && <span className="font-mono text-[8px] text-muted">Ukladám...</span>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["caption", "nano_banana", "cinematic", "instagram", "deepseek", "editorial"] as const).map((d) => {
              const active = (char.prompt_doctrine ?? "cinematic") === d;
              const label = d === "caption" ? "Caption" : d === "nano_banana" ? "Nano Banana" : d === "cinematic" ? "Cinematic" : d === "instagram" ? "Instagram" : d === "deepseek" ? "Deepseek" : "Editorial";
              return (
                <motion.button
                  key={d}
                  disabled={savingDoctrine}
                  onClick={async () => {
                    setSavingDoctrine(true);
                    await fetch("/api/characters/update", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ characterId: char.id, prompt_doctrine: d }),
                    });
                    setSavingDoctrine(false);
                    window.location.reload();
                  }}
                  className={`flex-1 font-mono text-[8px] uppercase tracking-[0.05em] border py-1 transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-accent/10 border-accent/40 text-accent"
                      : "border-border text-muted"
                  }`}
                  whileHover={{ color: active ? undefined : "#e2e2ea" }}
                  whileTap={{ scale: 0.95 }}
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Growth mode (discovery_mode flag) — reach-first caption + reel-hero framing */}
        <button
          onClick={toggleDiscovery}
          disabled={savingDiscovery}
          className={`w-full flex items-center justify-between border px-3 py-2 transition-colors disabled:opacity-50 ${
            discoveryOn ? "bg-teal/10 border-teal/40" : "bg-surface-low border-border"
          }`}
          title="Reach-first: hook captiony na každý deň + reel ako vizuálny hrdina"
        >
          <span className="flex items-center gap-1.5">
            <span className={`material-symbols-outlined text-[13px] ${discoveryOn ? "text-teal" : "text-muted"}`}>trending_up</span>
            <span className={`font-mono text-[8px] tracking-[0.1em] uppercase ${discoveryOn ? "text-teal" : "text-muted"}`}>
              Growth mode
            </span>
          </span>
          <span className={`font-mono text-[8px] tracking-[0.1em] uppercase ${discoveryOn ? "text-teal" : "text-muted"}`}>
            {savingDiscovery ? "…" : discoveryOn ? "ON" : "OFF"}
          </span>
        </button>

        {/* Stats row */}
        <div className="flex gap-4 mt-auto pt-3 border-t border-border">
          <div>
            <div className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase mb-0.5">Type</div>
            <div className="font-mono text-[9px] text-ink">{charType(char.platforms)}</div>
          </div>
          <div>
            <div className="font-mono text-[8px] tracking-[0.1em] text-muted uppercase mb-0.5">Uptime</div>
            <div className="font-mono text-[9px] text-ink">{uptimeHours(char.created_at)}</div>
          </div>
        </div>

        {/* Delete */}
        <div className="border-t border-border pt-2">
          <AnimatePresence mode="wait">
            {confirmDeleteId === char.id ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-mono text-[9px] text-red-400">Vymazať?</span>
                <div className="flex gap-1.5">
                  <motion.button
                    onClick={() => setConfirmDeleteId(null)}
                    className="font-mono text-[8px] uppercase border border-border px-2 py-0.5 text-muted hover:text-ink transition-colors"
                    whileTap={{ scale: 0.95 }}
                  >Nie</motion.button>
                  <motion.button
                    onClick={() => onDelete(char.id)}
                    disabled={deletingId === char.id}
                    className="font-mono text-[8px] uppercase border border-red-500/40 px-2 py-0.5 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    whileTap={{ scale: 0.95 }}
                  >
                    {deletingId === char.id ? "..." : "Áno"}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="delete"
                onClick={() => setConfirmDeleteId(char.id)}
                className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted hover:text-red-400 transition-colors flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="material-symbols-outlined text-[11px]">delete</span>
                Vymazať
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export default function Dashboard({ characters, todayStories, photoMap, topPosts = [] }: Props) {
  const router = useRouter();
  const activeChars = characters.filter((c) => c.is_active);
  const totalMedia = todayStories.flatMap((s) => s.chs_media);
  const postedMedia = totalMedia.filter((m) => m.status === "posted");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function triggerStory() {
    setIsGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/characters/story");
      if (res.ok) {
        setGenResult({ ok: true, msg: "Príbeh vygenerovaný! Stránka sa aktualizuje..." });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setGenResult({ ok: false, msg: data.error ?? `Chyba ${res.status}` });
        setIsGenerating(false);
      }
    } catch (err) {
      setGenResult({ ok: false, msg: err instanceof Error ? err.message : "Sieťová chyba" });
      setIsGenerating(false);
    }
    setTimeout(() => setGenResult(null), 4000);
  }

  async function triggerRegeneratePrompts() {
    setIsGenerating(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/characters/regenerate-prompts", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setGenResult({ ok: true, msg: "Prompty pregenerované! Stránka sa aktualizuje..." });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setGenResult({ ok: false, msg: data.error ?? `Chyba ${res.status}` });
        setIsGenerating(false);
      }
    } catch (err) {
      setGenResult({ ok: false, msg: err instanceof Error ? err.message : "Sieťová chyba" });
      setIsGenerating(false);
    }
    setTimeout(() => setGenResult(null), 5000);
  }

  async function deleteCharacter(characterId: string) {
    setDeletingId(characterId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch("/api/characters/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setGenResult({ ok: false, msg: data.error ?? "Chyba pri mazaní" });
        setTimeout(() => setGenResult(null), 4000);
      }
    } catch {
      setGenResult({ ok: false, msg: "Sieťová chyba" });
      setTimeout(() => setGenResult(null), 4000);
    }
    setDeletingId(null);
  }

  const quickActions = [
    {
      icon: "auto_awesome",
      label: "Generuj príbeh",
      desc: "Nový príbeh pre všetky charaktery",
      onClick: triggerStory,
      disabled: isGenerating,
    },
    {
      icon: "refresh",
      label: "Regeneruj prompty",
      desc: "Nové Higgsfield prompty pre dnešok",
      onClick: triggerRegeneratePrompts,
      disabled: isGenerating,
    },
    {
      icon: "add_circle",
      label: "Nový charakter",
      desc: "Vytvor nový AI profil",
      onClick: () => router.push("/create"),
      disabled: false,
    },
    {
      icon: "open_in_new",
      label: "Otvoriť Higgsfield",
      desc: "Generuj foto a video",
      onClick: () => window.open("https://higgsfield.ai", "_blank"),
      disabled: false,
    },
    {
      icon: "library_books",
      label: "Prompt knižnica",
      desc: "Všetky Higgsfield prompty",
      onClick: () => router.push("/prompts"),
      disabled: false,
    },
  ];

  const stats = [
    { label: "Charaktery",   value: characters.length,   sub: `${activeChars.length} aktívnych` },
    { label: "Dnešné posty", value: postedMedia.length,  sub: `z ${totalMedia.length} médií` },
    { label: "Príbehy dnes", value: todayStories.length, sub: "vygenerovaných" },
    { label: "Platformy",    value: 2,                   sub: "IG + YouTube" },
  ];

  return (
    <div className="relative">
      {/* Topbar */}
      <motion.div
        className="sticky top-0 z-40 bg-surface/90 backdrop-blur-sm border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-teal inline-block"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            systém aktívny
          </span>
        </div>
      </motion.div>

      {/* Notification banner */}
      <AnimatePresence>
        {genResult && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className={`px-8 py-2.5 font-mono text-[11px] border-b ${genResult.ok ? "bg-teal/5 border-teal/20 text-teal" : "bg-red-900/10 border-red-500/20 text-red-400"}`}
          >
            {genResult.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 lg:p-8">
        {/* Heading */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
        >
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">// Prehľad</p>
          <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-6">
            Character Studio
          </h2>
        </motion.div>

        {/* Stats */}
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border mb-8"
          variants={gridContainerVariants}
          initial="hidden"
          animate="visible"
        >
          {stats.map((s) => (
            <motion.div key={s.label} className="bg-surface p-5" variants={gridItemVariants}>
              <div className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">{s.label}</div>
              <div className="font-display text-[40px] leading-none text-white mb-1">
                <AnimatedCounter value={s.value} />
              </div>
              <div className="font-mono text-[10px] text-muted">{s.sub}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Today's outputs gallery */}
        <TodayOutputs todayStories={todayStories} characters={characters} />

        {/* Money view: Fanvue revenue + top posts */}
        <MoneyStrip characters={characters} topPosts={topPosts} />

        {/* Quick Actions */}
        <motion.div
          className="mb-10"
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-3">// Quick Actions</p>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border">
            {quickActions.map((action, i) => (
              <motion.button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className="bg-surface p-4 flex flex-col gap-3 text-left disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                whileHover={action.disabled ? {} : { backgroundColor: "rgba(17,19,25,1)" }}
                whileTap={action.disabled ? {} : { scale: 0.98 }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.06, duration: 0.3 }}
              >
                {/* Hover border accent */}
                <motion.div
                  className="absolute inset-0 border border-accent/0 pointer-events-none"
                  whileHover={{ borderColor: "rgba(74,158,255,0.35)" }}
                  transition={{ duration: 0.15 }}
                />
                <motion.span
                  className="material-symbols-outlined text-[20px] text-muted"
                  whileHover={{ color: "#4a9eff" }}
                  transition={{ duration: 0.15 }}
                >
                  {action.icon}
                </motion.span>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink mb-0.5">
                    {action.label}
                  </div>
                  <div className="font-mono text-[9px] text-muted">{action.desc}</div>
                </div>
                <motion.span
                  className="material-symbols-outlined text-[14px] text-muted self-end"
                  whileHover={{ x: 3, color: "#4a9eff" }}
                  transition={{ duration: 0.15 }}
                >
                  arrow_forward
                </motion.span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Character Library */}
        <motion.div
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.35 }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">// Character Library</p>
            <motion.a
              href="/characters"
              className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent hover:text-white transition-colors"
              whileHover={{ x: 2 }}
            >
              View All →
            </motion.a>
          </div>
          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border"
            variants={gridContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {characters.map((char) => (
              <CharacterCard
                key={char.id}
                char={char}
                photoUrl={photoMap[char.id]}
                onDelete={deleteCharacter}
                deletingId={deletingId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
              />
            ))}
            <motion.button
              onClick={() => router.push("/create")}
              className="bg-surface border border-border border-dashed flex flex-col items-center justify-center gap-2 p-4"
              style={{ minHeight: "260px" }}
              variants={gridItemVariants}
              whileHover={{ borderColor: "rgba(65,238,194,0.4)", backgroundColor: "rgba(17,19,25,1)" }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.span
                className="material-symbols-outlined text-[24px] text-muted"
                whileHover={{ color: "#41eec2", rotate: 90 }}
                transition={{ duration: 0.2 }}
              >add</motion.span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Nový charakter</span>
            </motion.button>
          </motion.div>
        </motion.div>
      </div>

      {/* FAB */}
      <motion.button
        onClick={triggerStory}
        disabled={isGenerating}
        className="fixed bottom-6 right-6 z-50 bg-accent text-white px-5 py-3 font-mono text-[10px] uppercase tracking-[0.1em] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 20 }}
        whileHover={isGenerating ? {} : { backgroundColor: "#60a5fa", scale: 1.03 }}
        whileTap={isGenerating ? {} : { scale: 0.97 }}
      >
        <motion.span
          className="material-symbols-outlined text-[16px]"
          animate={isGenerating ? { rotate: 360 } : {}}
          transition={isGenerating ? { duration: 1.2, repeat: Infinity, ease: "linear" } : {}}
        >
          {isGenerating ? "refresh" : "auto_awesome"}
        </motion.span>
        {isGenerating ? "Generujem..." : "Quick Generate"}
      </motion.button>
    </div>
  );
}

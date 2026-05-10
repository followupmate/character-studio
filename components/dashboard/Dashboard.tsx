"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Character, StoryDay, Media } from "@/types";
import MediaCard from "@/components/dashboard/MediaCard";
import SoulIdStatus from "@/components/dashboard/SoulIdStatus";

interface Props {
  characters: Character[];
  todayStories: (StoryDay & { chs_media: Media[] })[];
}

function CaptionBlock({ caption, hashtags }: { caption: string; hashtags?: string[] | null }) {
  return (
    <div className="pt-4 border-t border-border">
      <p className="font-mono text-[9px] text-muted tracking-wider uppercase mb-3">
        // Instagram caption
      </p>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 rounded-sm flex-shrink-0 mt-0.5">EN</span>
          <p className="text-xs text-ink italic leading-relaxed">{caption}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-mono text-[8px] bg-border border border-border2 text-muted px-1.5 py-0.5 rounded-sm flex-shrink-0 mt-0.5">SK</span>
          <p className="text-xs text-muted italic leading-relaxed">(SK preklad bude vygenerovaný)</p>
        </div>
      </div>
      {hashtags && hashtags.length > 0 && (
        <p className="font-mono text-[10px] text-muted mt-2">
          {hashtags.map((h) => `#${h}`).join(" ")}
        </p>
      )}
    </div>
  );
}

export default function Dashboard({ characters, todayStories }: Props) {
  const router = useRouter();
  const activeChars = characters.filter((c) => c.is_active);
  const totalMedia = todayStories.flatMap((s) => s.chs_media);
  const postedMedia = totalMedia.filter((m) => m.status === "posted");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
      const msg = err instanceof Error ? err.message : "Sieťová chyba";
      setGenResult({ ok: false, msg });
      setIsGenerating(false);
    }
    setTimeout(() => setGenResult(null), 4000);
  }

  return (
    <div>
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
        <h1 className="text-white font-medium text-sm tracking-wide">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
            systém aktívny
          </span>
          <button
            onClick={triggerStory}
            disabled={isGenerating}
            className="text-xs font-medium bg-accent text-white px-3 py-1.5 rounded hover:bg-blue-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generujem..." : "+ Generuj dnes"}
          </button>
        </div>
      </div>

      {/* Generation result banner */}
      {genResult && (
        <div className={`px-8 py-2.5 font-mono text-[11px] border-b ${genResult.ok ? "bg-teal/5 border-teal/20 text-teal" : "bg-red-900/10 border-red-500/20 text-red-400"}`}>
          {genResult.msg}
        </div>
      )}

      <div className="p-4 lg:p-8">
        {/* Eyebrow */}
        <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Prehľad</p>
        <h2 className="text-2xl font-medium text-white mb-1">Character Studio</h2>
        <p className="text-sm text-muted2 mb-8">
          Multi-character AI content platform. Každý charakter má vlastný príbeh a automatický posting.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Charaktery", value: characters.length, sub: `${activeChars.length} aktívnych` },
            { label: "Dnešné posty", value: postedMedia.length, sub: `z ${totalMedia.length} médií` },
            { label: "Príbehy dnes", value: todayStories.length, sub: "vygenerovaných" },
            { label: "Platformy", value: 2, sub: "IG + YouTube" },
          ].map((s) => (
            <div key={s.label} className="bg-bg2 border border-border rounded-md p-5">
              <div className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">{s.label}</div>
              <div className="text-3xl font-medium text-white leading-none mb-1">{s.value}</div>
              <div className="text-[11px] text-muted">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Today's stories */}
        {todayStories.length > 0 ? (
          <div className="space-y-4">
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase">// Dnešné príbehy</p>
            {todayStories.map((story) => {
              const char = characters.find((c) => c.id === story.character_id);
              const photoMedia = story.chs_media.find((m) => m.type === "photo");
              const videoMedia = story.chs_media.find((m) => m.type === "video");

              return (
                <div key={story.id} className="bg-bg2 border border-border rounded-md overflow-hidden">
                  {/* Story header */}
                  <div className="bg-bg3 px-5 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-white text-sm font-medium">◈ {char?.name ?? "Unknown"}</span>
                      <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
                        DAY {story.day_number}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] text-muted">{story.arc_position}</span>
                  </div>

                  {/* Story body */}
                  <div className="p-5 space-y-4">
                    <div className="font-mono text-[10px] text-teal tracking-wider">
                      📍 {story.location} · {story.mood}
                    </div>
                    <p className="text-sm text-ink italic leading-relaxed border-l-2 border-border2 pl-4">
                      {story.narrative}
                    </p>

                    {/* Production */}
                    {(photoMedia || videoMedia) && (
                      <div>
                        <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">
                          // Production
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {photoMedia && <MediaCard media={photoMedia} />}
                          {videoMedia && <MediaCard media={videoMedia} />}
                        </div>
                      </div>
                    )}

                    {story.ig_caption && (
                      <CaptionBlock caption={story.ig_caption} hashtags={story.hashtags} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-bg2 border border-border border-dashed rounded-md p-12 text-center">
            <div className="text-4xl mb-4">◎</div>
            <p className="text-white font-medium mb-2">Žiadny príbeh dnes</p>
            <p className="text-sm text-muted mb-6">
              Cron job sa spustí o 6:00 automaticky. Alebo vygeneruj manuálne.
            </p>
            <button
              onClick={triggerStory}
              disabled={isGenerating}
              className="text-sm font-medium bg-accent text-white px-5 py-2 rounded hover:bg-blue-400 transition-colors disabled:opacity-60"
            >
              {isGenerating ? "Generujem..." : "Generuj teraz"}
            </button>
          </div>
        )}

        {/* Characters quick view */}
        <div className="mt-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-4">// Charaktery</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {characters.map((char) => (
              <div key={char.id} className="bg-bg2 border border-border rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-medium">{char.name}</span>
                  <span className={`w-2 h-2 rounded-full ${char.is_active ? "bg-teal" : "bg-muted"}`} />
                </div>
                <div className="space-y-1 mb-1">
                  <SoulIdStatus soulId={char.soul_id} characterName={char.name} />
                  <div className="font-mono text-[9px] text-muted">Posting: {char.posting_time}</div>
                </div>
                <div className="flex gap-1.5 mt-3">
                  {char.platforms.map((p) => (
                    <span
                      key={p}
                      className={`font-mono text-[8px] border px-1.5 py-0.5 rounded-sm ${
                        p === "instagram"
                          ? "border-red-500/30 text-red-400"
                          : p === "youtube"
                          ? "border-amber/30 text-amber"
                          : "border-accent/30 text-accent"
                      }`}
                    >
                      {p.toUpperCase().slice(0, 2)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push("/create")}
              className="bg-bg2 border border-border border-dashed rounded-md p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-teal/40 hover:bg-bg3 transition-colors"
            >
              <span className="text-2xl text-muted">+</span>
              <span className="font-mono text-[9px] text-muted tracking-wider">NOVÝ CHARAKTER</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <p className="font-mono text-[9px] text-muted tracking-[0.15em] uppercase mb-3">
        // Instagram caption
      </p>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 flex-shrink-0 mt-0.5">EN</span>
          <p className="text-sm text-ink italic leading-relaxed font-display">{caption}</p>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-mono text-[8px] bg-border border border-border2 text-muted px-1.5 py-0.5 flex-shrink-0 mt-0.5">SK</span>
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

  const quickActions = [
    {
      icon: "auto_awesome",
      label: "Generuj príbeh",
      desc: "Nový príbeh pre všetky charaktery",
      onClick: triggerStory,
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

  return (
    <div className="relative">
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-surface border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between">
        <h1 className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted2">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
            systém aktívny
          </span>
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
        <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-1">// Prehľad</p>
        <h2 className="font-display italic text-[48px] leading-[1.1] text-white mb-6">
          Character Studio
        </h2>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border mb-8">
          {[
            { label: "Charaktery",    value: characters.length, sub: `${activeChars.length} aktívnych` },
            { label: "Dnešné posty",  value: postedMedia.length, sub: `z ${totalMedia.length} médií` },
            { label: "Príbehy dnes",  value: todayStories.length, sub: "vygenerovaných" },
            { label: "Platformy",     value: 2, sub: "IG + YouTube" },
          ].map((s) => (
            <div key={s.label} className="bg-surface p-5">
              <div className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-2">{s.label}</div>
              <div className="font-display text-[40px] leading-none text-white mb-1">{s.value}</div>
              <div className="font-mono text-[10px] text-muted">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-3">// Quick Actions</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                className="bg-surface p-4 flex flex-col gap-3 text-left hover:bg-surface-low border border-transparent hover:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <span className="material-symbols-outlined text-[20px] text-muted group-hover:text-accent transition-colors">
                  {action.icon}
                </span>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink mb-0.5">
                    {action.label}
                  </div>
                  <div className="font-mono text-[9px] text-muted">{action.desc}</div>
                </div>
                <span className="material-symbols-outlined text-[14px] text-muted self-end group-hover:text-accent transition-colors">
                  arrow_forward
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Today's stories — one self-contained card per character */}
        {todayStories.length > 0 ? (
          <div className="mb-8 space-y-px">
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase mb-3">// Dnešné príbehy</p>
            {todayStories.map((story) => {
              const char = characters.find((c) => c.id === story.character_id);
              const photoMedia = story.chs_media.find((m) => m.type === "photo");
              const videoMedia = story.chs_media.find((m) => m.type === "video");
              return (
                <div key={story.id} className="border border-border">
                  {/* Story header */}
                  <div className="bg-surface-low px-5 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink font-medium">
                        {char?.name ?? "Unknown"}
                      </span>
                      <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-[0.1em]">
                        DAY {story.day_number}
                      </span>
                      <span className="font-mono text-[9px] text-muted hidden sm:inline">
                        <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">location_on</span>
                        {story.location}
                      </span>
                    </div>
                    <span className="font-mono text-[9px] border border-border px-2 py-0.5 text-muted uppercase tracking-[0.1em]">
                      {story.arc_position}
                    </span>
                  </div>

                  {/* Story body */}
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
                    {/* Left: narrative + caption */}
                    <div className="space-y-4 border-l-2 border-vivienne pl-5">
                      <p className="font-mono text-[9px] text-muted uppercase tracking-[0.1em] sm:hidden">
                        📍 {story.location} · {story.mood}
                      </p>
                      <p className="font-mono text-[9px] text-muted uppercase tracking-[0.1em] hidden sm:block">
                        {story.mood}
                      </p>
                      <p className="font-display italic text-[18px] leading-relaxed text-ink">
                        {story.narrative}
                      </p>
                      {story.ig_caption && (
                        <CaptionBlock caption={story.ig_caption} hashtags={story.hashtags} />
                      )}
                    </div>

                    {/* Right: production media */}
                    {(photoMedia || videoMedia) && (
                      <div className="flex flex-col gap-px lg:w-64 xl:w-72">
                        <p className="font-mono text-[9px] text-muted uppercase tracking-[0.1em] mb-2">// Production</p>
                        {photoMedia && <MediaCard media={photoMedia} />}
                        {videoMedia && <MediaCard media={videoMedia} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-border border-dashed p-12 text-center mb-8">
            <p className="font-display italic text-[32px] text-muted mb-2">Žiadny príbeh dnes</p>
            <p className="font-mono text-[10px] text-muted mb-6">
              Cron job sa spustí o 6:00 UTC. Alebo vygeneruj manuálne.
            </p>
            <button
              onClick={triggerStory}
              disabled={isGenerating}
              className="font-mono text-[11px] uppercase tracking-[0.1em] bg-accent text-white px-5 py-2.5 hover:bg-blue-400 transition-colors disabled:opacity-60"
            >
              {isGenerating ? "Generujem..." : "Generuj teraz"}
            </button>
          </div>
        )}

        {/* Character Library */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[9px] tracking-[0.15em] text-muted uppercase">// Character Library</p>
            <a href="/characters" className="font-mono text-[9px] uppercase tracking-[0.1em] text-accent hover:text-white transition-colors">
              View All →
            </a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-border">
            {characters.map((char) => (
              <div key={char.id} className="char-card bg-surface relative overflow-hidden cursor-pointer group" style={{ aspectRatio: "1/1" }}>
                <div className="w-full h-full bg-surface-low flex flex-col items-center justify-center p-4">
                  <div className="absolute top-2 right-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${char.is_active ? "bg-teal" : "bg-muted"}`} />
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink font-medium mb-1">{char.name}</div>
                  <SoulIdStatus soulId={char.soul_id} characterName={char.name} />
                  <div className="font-mono text-[9px] text-muted mt-1">
                    {char.platforms.map((p) => p.slice(0, 2).toUpperCase()).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push("/create")}
              className="bg-surface border border-border border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-teal/40 hover:bg-surface-low transition-colors p-4"
              style={{ aspectRatio: "1/1" }}
            >
              <span className="material-symbols-outlined text-[24px] text-muted">add</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">Nový charakter</span>
            </button>
          </div>
        </div>
      </div>

      {/* FAB — quick generate */}
      <button
        onClick={triggerStory}
        disabled={isGenerating}
        className="fixed bottom-6 right-6 z-50 bg-accent text-white px-5 py-3 font-mono text-[10px] uppercase tracking-[0.1em] flex items-center gap-2 hover:bg-blue-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
        {isGenerating ? "Generujem..." : "Quick Generate"}
      </button>
    </div>
  );
}

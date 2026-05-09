"use client";

import { useState } from "react";
import { Character, StoryDay, Media } from "@/types";

interface Props {
  characters: Character[];
  todayStories: (StoryDay & { chs_media: Media[] })[];
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-border text-muted2 border-border2",
    generating: "bg-amber/10 text-amber border-amber/20 animate-pulse",
    ready: "bg-teal/10 text-teal border-teal/20",
    posted: "bg-accent/10 text-accent border-accent/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`font-mono text-[8px] tracking-wider px-2 py-0.5 border rounded-sm ${styles[status] ?? styles.pending}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

export default function Dashboard({ characters, todayStories }: Props) {
  const activeChars = characters.filter((c) => c.is_active);
  const totalMedia = todayStories.flatMap((s) => s.chs_media);
  const postedMedia = totalMedia.filter((m) => m.status === "posted");

  const [approvingStories, setApprovingStories] = useState<Set<string>>(new Set());
  const [postingMedias, setPostingMedias] = useState<Set<string>>(new Set());

  async function triggerStory() {
    await fetch("/api/characters/story");
    window.location.reload();
  }

  async function approveGenerate(storyDayId: string) {
    setApprovingStories((prev) => new Set([...prev, storyDayId]));
    await fetch("/api/characters/approve-generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyDayId }),
    });
    setApprovingStories((prev) => {
      const next = new Set(prev);
      next.delete(storyDayId);
      return next;
    });
    window.location.reload();
  }

  async function approvePost(mediaId: string) {
    setPostingMedias((prev) => new Set([...prev, mediaId]));
    await fetch("/api/characters/approve-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    setPostingMedias((prev) => {
      const next = new Set(prev);
      next.delete(mediaId);
      return next;
    });
    window.location.reload();
  }

  return (
    <div>
      {/* Topbar */}
      <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center justify-between">
        <h1 className="text-white font-medium text-sm tracking-wide">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse inline-block" />
            systém aktívny
          </span>
          <button
            onClick={triggerStory}
            className="text-xs font-medium bg-accent text-white px-3 py-1.5 rounded hover:bg-blue-400 transition-colors"
          >
            + Generuj dnes
          </button>
        </div>
      </div>

      <div className="p-8">
        {/* Eyebrow */}
        <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Prehľad</p>
        <h2 className="text-2xl font-medium text-white mb-1">Character Studio</h2>
        <p className="text-sm text-muted2 mb-8">
          Multi-character AI content platform. Každý charakter má vlastný príbeh a automatický posting.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-8">
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
              const hasPending = story.chs_media.some((m) => m.status === "pending");
              const isApprovingGenerate = approvingStories.has(story.id);

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
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[9px] text-muted">{story.arc_position}</span>
                      {hasPending && (
                        <button
                          onClick={() => approveGenerate(story.id)}
                          disabled={isApprovingGenerate}
                          className="text-[11px] font-medium bg-teal/10 border border-teal/30 text-teal px-3 py-1 rounded hover:bg-teal/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isApprovingGenerate ? "Spúšťam…" : "Schváliť generovanie"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Story body */}
                  <div className="p-5">
                    <div className="font-mono text-[10px] text-teal tracking-wider mb-3">
                      📍 {story.location} · {story.mood}
                    </div>
                    <p className="text-sm text-ink italic leading-relaxed border-l-2 border-border2 pl-4 mb-4">
                      {story.narrative}
                    </p>

                    {/* Media items */}
                    {story.chs_media.length > 0 && (
                      <div className="grid grid-cols-2 gap-3">
                        {story.chs_media.map((m) => {
                          const isPostingThis = postingMedias.has(m.id);
                          return (
                            <div
                              key={m.id}
                              className="bg-bg3 border border-border rounded p-3 flex items-center gap-3"
                            >
                              <span className="text-xl">{m.type === "photo" ? "📷" : "🎬"}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-mono text-[9px] text-muted uppercase tracking-wider mb-1">
                                  {m.type}
                                </div>
                                <div className="text-xs text-ink">
                                  {m.type === "photo" ? "Seedance 2.0" : "Cinema Studio 3.5"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusBadge status={m.status} />
                                {m.status === "ready" && (
                                  <button
                                    onClick={() => approvePost(m.id)}
                                    disabled={isPostingThis}
                                    className="text-[10px] font-medium bg-accent/10 border border-accent/30 text-accent px-2 py-0.5 rounded hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isPostingThis ? "Postuje…" : "Schváliť posting"}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Caption preview */}
                    {story.ig_caption && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="font-mono text-[9px] text-muted tracking-wider uppercase mb-2">
                          // Instagram caption
                        </p>
                        <p className="text-xs text-muted2 italic leading-relaxed">{story.ig_caption}</p>
                        <p className="font-mono text-[10px] text-muted mt-1">
                          {story.hashtags?.map((h) => `#${h}`).join(" ")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // Empty state
          <div className="bg-bg2 border border-border border-dashed rounded-md p-12 text-center">
            <div className="text-4xl mb-4">◎</div>
            <p className="text-white font-medium mb-2">Žiadny príbeh dnes</p>
            <p className="text-sm text-muted mb-6">
              Cron job sa spustí o 6:00 automaticky. Alebo vygeneruj manuálne.
            </p>
            <button
              onClick={triggerStory}
              className="text-sm font-medium bg-accent text-white px-5 py-2 rounded hover:bg-blue-400 transition-colors"
            >
              Generuj teraz
            </button>
          </div>
        )}

        {/* Characters quick view */}
        <div className="mt-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-4">// Charaktery</p>
          <div className="grid grid-cols-3 gap-4">
            {characters.map((char) => (
              <div key={char.id} className="bg-bg2 border border-border rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-medium">{char.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${char.is_active ? "bg-teal" : "bg-muted"}`}
                  />
                </div>
                <div className="font-mono text-[9px] text-muted leading-relaxed">
                  <div>{char.soul_id ? `Soul: ${char.soul_id.slice(0, 12)}...` : "Soul ID: chýba"}</div>
                  <div>Posting: {char.posting_time}</div>
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

            {/* Add new */}
            <div className="bg-bg2 border border-border border-dashed rounded-md p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-teal/40 transition-colors">
              <span className="text-2xl text-muted">+</span>
              <span className="font-mono text-[9px] text-muted tracking-wider">NOVÝ CHARAKTER</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { supabase } from "@/lib/supabase";
import { Character, StoryDay, Media } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";
import MediaCard from "@/components/dashboard/MediaCard";
import CharacterSelector from "@/components/today/CharacterSelector";
import DateNav from "@/components/today/DateNav";
import GenerateForwardButton from "@/components/today/GenerateForwardButton";

type TodayStory = StoryDay & {
  chs_media: Media[];
  chs_characters: Character;
  hook_text?: string | null;
};

const arcColors: Record<string, string> = {
  opening: "text-teal border-teal/20 bg-teal/10",
  rising: "text-accent border-accent/20 bg-accent/10",
  peak: "text-amber border-amber/20 bg-amber/10",
  turning: "text-amber border-amber/20 bg-amber/10",
  falling: "text-muted2 border-border2 bg-bg3",
  quiet: "text-muted2 border-border2 bg-bg3",
};

const tierColors: Record<string, string> = {
  lifestyle_travel: "text-teal border-teal/20 bg-teal/10",
  intimate_aesthetic: "text-pink-400 border-pink-400/20 bg-pink-400/10",
};

function ProductionGroup({ title, hint, items }: { title: string; hint: string; items: Media[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-mono text-[9px] text-muted tracking-widest uppercase">// {title}</p>
        <p className="font-mono text-[9px] text-muted2">{hint}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((m) => (
          <MediaCard key={m.id} media={m} />
        ))}
      </div>
    </div>
  );
}

function CaptionBlock({ caption, hashtags }: { caption: string; hashtags?: string[] | null }) {
  return (
    <div className="pt-4 border-t border-border space-y-4">
      <div>
        <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">
          // Instagram caption
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="font-mono text-[8px] bg-accent/10 border border-accent/20 text-accent px-1.5 py-0.5 rounded-sm flex-shrink-0 mt-0.5">EN</span>
            <p className="text-sm text-ink italic leading-relaxed whitespace-pre-line">{caption}</p>
          </div>
        </div>
        {hashtags && hashtags.length > 0 && (
          <p className="font-mono text-[10px] text-muted leading-relaxed mt-2">
            {hashtags.map((h) => `#${h}`).join(" ")}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ char?: string; date?: string }>;
}) {
  const { char: selectedCharId, date: dateParam } = await searchParams;
  const todayDate = new Date().toISOString().split("T")[0];
  const viewDate = dateParam ?? todayDate;

  const { data } = await supabase
    .from("chs_story_days")
    .select("*, chs_media(*), chs_characters(*)")
    .eq("date", viewDate)
    .order("created_at", { ascending: false });

  const allStories = (data as TodayStory[]) ?? [];

  const characters = Array.from(
    new Map(allStories.map((s) => [s.chs_characters?.id, s.chs_characters])).values()
  ).filter(Boolean) as Character[];

  const stories = selectedCharId
    ? allStories.filter((s) => s.chs_characters?.id === selectedCharId)
    : allStories;

  const viewDateLabel = new Date(viewDate + "T12:00:00Z").toLocaleDateString("sk-SK", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isToday = viewDate === todayDate;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border pl-14 pr-4 lg:px-8 h-13 flex items-center justify-between gap-4">
          <h1 className="text-white font-medium text-sm tracking-wide flex-shrink-0">
            {isToday ? "Dnešný deň" : "Archív"}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {characters.length > 1 && (
              <CharacterSelector characters={characters} selectedCharId={selectedCharId ?? "all"} />
            )}
            <DateNav currentDate={viewDate} todayDate={todayDate} charId={selectedCharId} />
          </div>
        </div>

        <div className="p-4 lg:p-8 space-y-8">
          {/* Header */}
          <div>
            <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-1">
              // {isToday ? "Dnešné príbehy" : `Archív · ${viewDate}`}
            </p>
            <h2 className="text-2xl font-medium text-white mb-1">{viewDateLabel}</h2>
            <p className="text-sm text-muted2">
              {isToday
                ? "Príbehy, médiá a Instagram captions vygenerované dnes."
                : "Archivovaný deň — médiá a captions z tohto dňa."}
            </p>
          </div>

          {/* Generate ahead panel — always visible */}
          <div className="bg-bg2 border border-border rounded-md p-5">
            <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">// Generovanie dopredu</p>
            <GenerateForwardButton characterId={selectedCharId} />
          </div>

          {/* Stories */}
          {stories.length === 0 ? (
            <div className="bg-bg2 border border-border border-dashed rounded-md p-12 text-center">
              <div className="text-4xl mb-4">◎</div>
              <p className="text-white font-medium mb-2">Žiadny príbeh pre {viewDate}</p>
              <p className="text-sm text-muted">
                {isToday
                  ? "Cron job sa spustí o 6:00 UTC. Alebo generuj dopredu hore."
                  : "Pre tento deň ešte nebol vygenerovaný príbeh. Použi tlačidlo hore."}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {stories.map((story) => {
                const char = story.chs_characters;

                return (
                  <div key={story.id} className="bg-bg2 border border-border rounded-md overflow-hidden">
                    {/* Story header */}
                    <div className="bg-bg3 px-6 py-4 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${char?.is_active ? "bg-teal" : "bg-muted"}`} />
                        <span className="text-white font-medium">{char?.name ?? "Unknown"}</span>
                        <span className="font-mono text-[9px] text-muted hidden sm:inline">/{char?.slug}</span>
                        <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
                          DAY {story.day_number}
                        </span>
                        {story.tier && (
                          <span className={`font-mono text-[9px] border px-2 py-0.5 tracking-wider uppercase ${tierColors[story.tier] ?? "text-muted2 border-border bg-bg3"}`}>
                            {story.tier.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <span className={`font-mono text-[9px] border px-2 py-0.5 rounded-sm tracking-wider ${arcColors[story.arc_position] ?? arcColors.quiet}`}>
                        {story.arc_position.toUpperCase()}
                      </span>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Location + mood + emotional beat + drift seeds */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="font-mono text-[11px] text-teal tracking-wider">📍 {story.location}</div>
                        <span className="text-border2">·</span>
                        <div className="font-mono text-[11px] text-muted2 italic">{story.mood}</div>
                        {story.emotional_beat && (
                          <>
                            <span className="text-border2">·</span>
                            <span className="font-mono text-[10px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider uppercase">
                              {story.emotional_beat.replace(/_/g, " ")}
                            </span>
                          </>
                        )}
                        {(story as TodayStory & { drift_seeds?: Array<{ kind: string; detail?: string }> }).drift_seeds?.map((s) => (
                          <span key={s.kind} className="font-mono text-[9px] bg-amber/10 border border-amber/20 text-amber px-2 py-0.5 tracking-wider uppercase">
                            ⊘ {s.kind.replace(/_/g, " ")}{s.detail ? ` · ${s.detail}` : ""}
                          </span>
                        ))}
                      </div>

                      {/* Narrative */}
                      <div>
                        <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">// Naratív</p>
                        <p className="text-sm text-ink italic leading-relaxed border-l-2 border-border2 pl-4">
                          {story.narrative}
                        </p>
                      </div>

                      {/* Next hint */}
                      {story.next_hint && (
                        <div className="bg-bg3 border border-border rounded px-4 py-3">
                          <span className="font-mono text-[9px] text-muted tracking-widest uppercase">// Zajtra: </span>
                          <span className="font-mono text-[10px] text-muted2 italic">{story.next_hint}</span>
                        </div>
                      )}

                      {/* Production assets grouped by channel */}
                      {(() => {
                        const sorted = [...story.chs_media].sort((a, b) => {
                          const ai = a.sequence_index ?? 99;
                          const bi = b.sequence_index ?? 99;
                          if (ai !== bi) return ai - bi;
                          return (a.slot ?? "").localeCompare(b.slot ?? "");
                        });
                        const feed = sorted.filter((m) => m.channel === "feed");
                        const reel = sorted.filter((m) => m.channel === "reel");
                        const storyAssets = sorted.filter((m) => m.channel === "story");
                        const legacy = sorted.filter((m) => !m.channel);

                        if (sorted.length === 0) return null;

                        return (
                          <div className="space-y-6">
                            {feed.length > 0 && (
                              <ProductionGroup
                                title="Feed Carousel"
                                hint={`${feed.length} / 5 framov · IG carousel (4:5)`}
                                items={feed}
                              />
                            )}
                            {reel.length > 0 && (
                              <ProductionGroup
                                title="Reel (Kling 3.0)"
                                hint="Start frame → image gen, motion → Kling i2v · 9:16 · 5–9s"
                                items={reel}
                              />
                            )}
                            {storyAssets.length > 0 && (
                              <ProductionGroup
                                title="Story"
                                hint="BTS · 9:16"
                                items={storyAssets}
                              />
                            )}
                            {legacy.length > 0 && (
                              <ProductionGroup
                                title="Production (legacy)"
                                hint="Older assets without slot metadata"
                                items={legacy}
                              />
                            )}
                          </div>
                        );
                      })()}

                      {story.ig_caption && (
                        <CaptionBlock
                          caption={story.ig_caption}
                          hashtags={story.hashtags}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

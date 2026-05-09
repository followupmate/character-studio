import { supabase } from "@/lib/supabase";
import { Character, StoryDay, Media } from "@/types";
import Sidebar from "@/components/dashboard/Sidebar";

export const dynamic = "force-dynamic";

type TodayStory = StoryDay & {
  chs_media: Media[];
  chs_characters: Character;
};

async function getTodayData(): Promise<TodayStory[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("chs_story_days")
    .select("*, chs_media(*), chs_characters(*)")
    .eq("date", today)
    .order("created_at", { ascending: false });
  return (data as TodayStory[]) ?? [];
}

const arcColors: Record<string, string> = {
  opening: "text-teal border-teal/20 bg-teal/10",
  rising: "text-accent border-accent/20 bg-accent/10",
  peak: "text-amber border-amber/20 bg-amber/10",
  turning: "text-amber border-amber/20 bg-amber/10",
  falling: "text-muted2 border-border2 bg-bg3",
  quiet: "text-muted2 border-border2 bg-bg3",
};

export default async function TodayPage() {
  const stories = await getTodayData();
  const today = new Date().toLocaleDateString("sk-SK", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56">
        {/* Topbar */}
        <div className="sticky top-0 z-40 bg-bg2 border-b border-border px-8 h-13 flex items-center justify-between">
          <h1 className="text-white font-medium text-sm tracking-wide">Dnešný deň</h1>
          <span className="font-mono text-[10px] text-muted">{today}</span>
        </div>

        <div className="p-8">
          <p className="font-mono text-[9px] tracking-widest text-muted uppercase mb-2">// Dnešné príbehy</p>
          <h2 className="text-2xl font-medium text-white mb-1">Dnešný deň</h2>
          <p className="text-sm text-muted2 mb-8">
            Príbehy, médiá a Instagram captions vygenerované dnes.
          </p>

          {stories.length === 0 ? (
            <div className="bg-bg2 border border-border border-dashed rounded-md p-12 text-center">
              <div className="text-4xl mb-4">◎</div>
              <p className="text-white font-medium mb-2">Žiadny príbeh dnes</p>
              <p className="text-sm text-muted">Cron job sa spustí o 6:00 UTC. Alebo spusti manuálne z Dashboardu.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {stories.map((story) => {
                const char = story.chs_characters;
                const photoMedia = story.chs_media.find((m) => m.type === "photo");
                const videoMedia = story.chs_media.find((m) => m.type === "video");

                return (
                  <div key={story.id} className="bg-bg2 border border-border rounded-md overflow-hidden">
                    {/* Story header */}
                    <div className="bg-bg3 px-6 py-4 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            char?.is_active ? "bg-teal" : "bg-muted"
                          }`}
                        />
                        <span className="text-white font-medium">{char?.name ?? "Unknown"}</span>
                        <span className="font-mono text-[9px] text-muted">/{char?.slug}</span>
                        <span className="font-mono text-[9px] bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 tracking-wider">
                          DAY {story.day_number}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-[9px] border px-2 py-0.5 rounded-sm tracking-wider ${
                          arcColors[story.arc_position] ?? arcColors.quiet
                        }`}
                      >
                        {story.arc_position.toUpperCase()}
                      </span>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Location + mood */}
                      <div className="flex items-center gap-4">
                        <div className="font-mono text-[11px] text-teal tracking-wider">
                          📍 {story.location}
                        </div>
                        <span className="text-border2">·</span>
                        <div className="font-mono text-[11px] text-muted2 italic">{story.mood}</div>
                      </div>

                      {/* Narrative */}
                      <div>
                        <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">
                          // Naratív
                        </p>
                        <p className="text-sm text-ink italic leading-relaxed border-l-2 border-border2 pl-4">
                          {story.narrative}
                        </p>
                      </div>

                      {/* Next hint */}
                      {story.next_hint && (
                        <div className="bg-bg3 border border-border rounded px-4 py-3">
                          <span className="font-mono text-[9px] text-muted tracking-widest uppercase">
                            // Zajtra:{" "}
                          </span>
                          <span className="font-mono text-[10px] text-muted2 italic">{story.next_hint}</span>
                        </div>
                      )}

                      {/* Media prompts */}
                      {(photoMedia || videoMedia) && (
                        <div>
                          <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">
                            // Higgsfield prompty
                          </p>
                          <div className="grid grid-cols-1 gap-3">
                            {photoMedia && (
                              <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-base">📷</span>
                                  <span className="font-mono text-[9px] text-muted uppercase tracking-wider">
                                    Photo prompt
                                  </span>
                                  <span
                                    className={`font-mono text-[8px] border px-1.5 py-0.5 rounded-sm ml-auto ${
                                      photoMedia.status === "ready"
                                        ? "border-teal/20 text-teal bg-teal/10"
                                        : photoMedia.status === "generating"
                                        ? "border-amber/20 text-amber bg-amber/10"
                                        : photoMedia.status === "posted"
                                        ? "border-accent/20 text-accent bg-accent/10"
                                        : "border-border2 text-muted2"
                                    }`}
                                  >
                                    {photoMedia.status.toUpperCase()}
                                  </span>
                                </div>
                                <pre className="bg-bg3 border border-border rounded p-4 font-mono text-[10px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                                  {photoMedia.higgsfield_prompt}
                                </pre>
                              </div>
                            )}
                            {videoMedia && (
                              <div>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-base">🎬</span>
                                  <span className="font-mono text-[9px] text-muted uppercase tracking-wider">
                                    Video prompt
                                  </span>
                                  <span
                                    className={`font-mono text-[8px] border px-1.5 py-0.5 rounded-sm ml-auto ${
                                      videoMedia.status === "ready"
                                        ? "border-teal/20 text-teal bg-teal/10"
                                        : videoMedia.status === "generating"
                                        ? "border-amber/20 text-amber bg-amber/10"
                                        : videoMedia.status === "posted"
                                        ? "border-accent/20 text-accent bg-accent/10"
                                        : "border-border2 text-muted2"
                                    }`}
                                  >
                                    {videoMedia.status.toUpperCase()}
                                  </span>
                                </div>
                                <pre className="bg-bg3 border border-border rounded p-4 font-mono text-[10px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                                  {videoMedia.higgsfield_prompt}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* IG Caption + hashtags */}
                      {story.ig_caption && (
                        <div className="pt-4 border-t border-border">
                          <p className="font-mono text-[9px] text-muted tracking-widest uppercase mb-3">
                            // Instagram caption
                          </p>
                          <p className="text-sm text-ink italic leading-relaxed mb-3 whitespace-pre-line">
                            {story.ig_caption}
                          </p>
                          {story.hashtags && story.hashtags.length > 0 && (
                            <p className="font-mono text-[10px] text-muted leading-relaxed">
                              {story.hashtags.map((h) => `#${h}`).join(" ")}
                            </p>
                          )}
                        </div>
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

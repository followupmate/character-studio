import { supabase } from "@/lib/supabase";
import { calculateGrowthScore } from "@/lib/growthScore";
import type { ContentDescriptor, PostPerformance } from "./types";

// Reads REAL performance already imported by the existing production Metrics system — the
// SAME chs_posts.engagement jsonb / growth_score / growth_winner that app/metrics (Metriky)
// reads and writes to, via two paths: app/api/publish/import-insights/route.ts (automatic IG
// Graph API fetch: reach/likes/comments/saves/shares/profile_visits/follows) and
// app/api/characters/import-metrics/route.ts (manual entry from the Metrics UI, which also
// covers fanvue_clicks — a business metric, not from the IG API). This adapter is a read-only
// consumer of that single existing store — it does not call the IG Graph API itself, does not
// write anywhere the Metrics UI doesn't already write, and never fabricates a value.

interface RawPostRow {
  id: string;
  media_id: string | null;
  story_day_id: string | null;
  post_type: string;
  posted_at: string | null;
  engagement: Record<string, number> | null;
  growth_score: number | null;
  growth_winner: boolean | null;
  chs_media: {
    id: string;
    shot_archetype: string | null;
    channel: string | null;
    visual_signature: {
      situation_tags?: {
        activity_family?: string | null;
        location_family?: string | null;
        sexual_energy_level?: string | null;
        continuity_phase?: string | null;
      };
    } | null;
  } | null;
  chs_story_days: {
    id: string;
    tier: string | null;
    moment_family: string | null;
    location: string | null;
    mood: string | null;
    magnetism_level: string | null;
  } | null;
}

export interface AnalyzedPost {
  performance: PostPerformance;
  descriptor: ContentDescriptor;
}

// Fetches every posted Instagram post for a character within the window, paired with the
// content descriptor it was generated under. Posts without real metrics yet (growth_score
// null/0, i.e. import-insights hasn't scored them) are still returned — callers decide how
// to treat them — but never get a fabricated score.
export async function fetchRecentPostPerformance(
  characterId: string,
  windowDays: number
): Promise<AnalyzedPost[]> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  const { data, error } = await supabase
    .from("chs_posts")
    .select(
      `id, media_id, story_day_id, post_type, posted_at, engagement, growth_score, growth_winner,
       chs_media ( id, shot_archetype, channel, visual_signature ),
       chs_story_days ( id, tier, moment_family, location, mood, magnetism_level )`
    )
    .eq("character_id", characterId)
    .eq("status", "posted")
    .eq("platform", "instagram")
    .neq("post_type", "story")
    .not("posted_at", "is", null)
    .gte("posted_at", since)
    .order("posted_at", { ascending: false });

  if (error) throw new Error(`fetchRecentPostPerformance: ${error.message}`);

  const rows = (data ?? []) as unknown as RawPostRow[];
  return rows.map(rowToAnalyzedPost);
}

function rowToAnalyzedPost(row: RawPostRow): AnalyzedPost {
  const eng = row.engagement ?? {};
  const tags = row.chs_media?.visual_signature?.situation_tags;

  const performance: PostPerformance = {
    post_id: row.id,
    media_id: row.media_id ?? "",
    story_day_id: row.story_day_id,
    posted_at: row.posted_at,
    post_type: row.post_type,
    views: numOrUndef(eng.views),
    reach: numOrUndef(eng.reach),
    likes: numOrUndef(eng.likes),
    comments: numOrUndef(eng.comments),
    saves: numOrUndef(eng.saves),
    shares: numOrUndef(eng.shares),
    profile_visits: numOrUndef(eng.profile_visits),
    follows: numOrUndef(eng.follows),
    fanvue_clicks: numOrUndef(eng.fanvue_clicks),
    growth_score: row.growth_score ?? calculateGrowthScore(eng),
    growth_winner: row.growth_winner,
  };

  const descriptor: ContentDescriptor = {
    tier: (row.chs_story_days?.tier as ContentDescriptor["tier"]) ?? null,
    moment_family: (row.chs_story_days?.moment_family as ContentDescriptor["moment_family"]) ?? null,
    location: row.chs_story_days?.location ?? null,
    mood: row.chs_story_days?.mood ?? null,
    magnetism_level: (row.chs_story_days?.magnetism_level as ContentDescriptor["magnetism_level"]) ?? null,
    activity_family: tags?.activity_family ?? null,
    location_family: tags?.location_family ?? null,
    sexual_energy_level: tags?.sexual_energy_level ?? null,
    continuity_phase: tags?.continuity_phase ?? null,
    shot_archetype: row.chs_media?.shot_archetype ?? null,
    channel: row.chs_media?.channel ?? null,
  };

  return { performance, descriptor };
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

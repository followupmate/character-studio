/**
 * Supabase side of the trending-audio feature: character flag lookup, "recently used" audio ids and
 * audio bookkeeping on chs_posts. Every function is failure-tolerant — a missing column (migration
 * 20261005_post_audio.sql not run yet) or a DB error must never block publishing.
 */
import { supabase } from "@/lib/supabase";
import { isFlagOn } from "@/lib/featureFlags";
import { errMessage } from "@/lib/fbToken";
import type { PublishedAudio } from "@/lib/igReelAudioPublish";

export const AUDIO_REPEAT_WINDOW_DAYS = 14;

export async function loadCharacterAudioFlag(characterId: string | null | undefined): Promise<boolean> {
  if (!characterId) return false;
  const { data, error } = await supabase.from("chs_characters").select("feature_flags").eq("id", characterId).maybeSingle();
  if (error) throw new Error(error.message);
  return isFlagOn((data as { feature_flags?: unknown } | null)?.feature_flags, "ig_trending_audio");
}

export async function loadRecentAudioIds(now: Date = new Date(), days = AUDIO_REPEAT_WINDOW_DAYS): Promise<string[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("chs_posts")
    .select("audio_id")
    .not("audio_id", "is", null)
    .gte("posted_at", since);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ audio_id: string | null }>).map((r) => r.audio_id).filter((x): x is string => !!x);
}

/** Best-effort, separate statement so a missing column cannot break the main status update. */
export async function saveAudioOnPost(postId: string, audio: PublishedAudio): Promise<void> {
  try {
    const { error } = await supabase
      .from("chs_posts")
      .update({
        audio_id: audio.id,
        audio_title: audio.title,
        audio_artist: audio.artist,
        audio_ads_eligible: audio.adsEligible,
      })
      .eq("id", postId);
    if (error) console.warn(`[ig-audio] could not store audio on post ${postId}: ${error.message}`);
  } catch (e) {
    console.warn(`[ig-audio] could not store audio on post ${postId}: ${errMessage(e)}`);
  }
}

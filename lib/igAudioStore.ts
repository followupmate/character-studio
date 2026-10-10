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

/* ── Phase 7: trending-audio test bookkeeping (no new columns) ───────────────────────────────── */

export const TRENDING_LOCK_FLAG = "ig_audio_trending_muted";

/** feature_flags.ig_audio_trending_muted === true -> trending is locked to library for this character. */
export async function loadTrendingLock(characterId: string | null | undefined): Promise<boolean> {
  if (!characterId) return false;
  const { data, error } = await supabase.from("chs_characters").select("feature_flags").eq("id", characterId).maybeSingle();
  if (error) throw new Error(error.message);
  return isFlagOn((data as { feature_flags?: unknown } | null)?.feature_flags, TRENDING_LOCK_FLAG);
}

/**
 * Written by code (copyright sweep) when a trending reel comes back muted/restricted. Read-modify-write
 * of the jsonb so every other flag survives. Rollback: feature_flags - 'ig_audio_trending_muted'.
 */
export async function setTrendingLock(characterId: string, info: { postId: string; reason: string }): Promise<void> {
  const { data, error } = await supabase.from("chs_characters").select("feature_flags").eq("id", characterId).maybeSingle();
  if (error) throw new Error(error.message);
  const flags = { ...(((data as { feature_flags?: Record<string, unknown> } | null)?.feature_flags) ?? {}) };
  if (flags[TRENDING_LOCK_FLAG] === true) return;
  flags[TRENDING_LOCK_FLAG] = true;
  flags[`${TRENDING_LOCK_FLAG}_at`] = new Date().toISOString();
  flags[`${TRENDING_LOCK_FLAG}_post`] = info.postId;
  flags[`${TRENDING_LOCK_FLAG}_reason`] = info.reason.slice(0, 200);
  const { error: upErr } = await supabase.from("chs_characters").update({ feature_flags: flags }).eq("id", characterId);
  if (upErr) throw new Error(upErr.message);
}

/**
 * Audio bookkeeping lives in the existing chs_posts.engagement jsonb under `audio_meta` (import-insights
 * MERGES engagement, so the key survives metric imports). No migration needed. Best-effort.
 */
export async function mergeAudioMeta(postId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const { data, error } = await supabase.from("chs_posts").select("engagement").eq("id", postId).maybeSingle();
    if (error) throw new Error(error.message);
    const engagement = { ...(((data as { engagement?: Record<string, unknown> } | null)?.engagement) ?? {}) };
    const prev = (engagement.audio_meta && typeof engagement.audio_meta === "object" ? engagement.audio_meta : {}) as Record<string, unknown>;
    engagement.audio_meta = { ...prev, ...patch };
    const { error: upErr } = await supabase.from("chs_posts").update({ engagement }).eq("id", postId);
    if (upErr) throw new Error(upErr.message);
  } catch (e) {
    console.warn(`[ig-audio] could not store audio_meta on post ${postId}: ${errMessage(e)}`);
  }
}

export interface CopyrightCandidate {
  id: string;
  character_id: string | null;
  platform_post_id: string;
  posted_at: string;
  audio_meta: Record<string, unknown>;
}

/** IG reels published with FB-path audio in the last `days` days. Filtering on audio_meta happens in code. */
export async function loadCopyrightCandidates(now: Date = new Date(), days = 3): Promise<CopyrightCandidate[]> {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("chs_posts")
    .select("id, character_id, platform_post_id, posted_at, engagement")
    .eq("platform", "instagram")
    .eq("post_type", "reel")
    .eq("status", "posted")
    .not("platform_post_id", "is", null)
    .gte("posted_at", since);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; character_id: string | null; platform_post_id: string; posted_at: string; engagement?: Record<string, unknown> | null }>)
    .filter((r) => r.engagement && typeof r.engagement.audio_meta === "object" && r.engagement.audio_meta !== null)
    .map((r) => ({ id: r.id, character_id: r.character_id, platform_post_id: r.platform_post_id, posted_at: r.posted_at, audio_meta: r.engagement!.audio_meta as Record<string, unknown> }));
}

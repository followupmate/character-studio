/**
 * Instagram Audio API (Facebook Login only): list trending / searched audio and build the
 * `audio_configuration` container parameter. Pure + fetch-injectable; no Supabase here.
 *
 * Verified live (graph.facebook.com v25.0, 2026-10-04, @vivienne.mov):
 *   GET /ig_audio?audio_type=music&ig_user_id=<IG id>[&search_query=..][&limit=..][&after=<cursor>]
 *   -> { audio: [ { audio_id, duration_in_ms, title, display_artist, audio_type,
 *                   on_platform_audio_preview_link, ig_username, is_ads_eligible } ... ],
 *        paging: { cursors: { after } } }          (25 per page; search results carry download_url)
 * The list key is `audio` (we also accept `data`). Trending commercial music had is_ads_eligible=false.
 */
import { FB_GRAPH, errMessage, redactSecrets } from "./fbToken";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface IgAudioItem {
  audio_id: string;
  duration_in_ms?: number;
  title?: string;
  display_artist?: string;
  audio_type?: string;
  is_ads_eligible?: boolean;
  on_platform_audio_preview_link?: string;
  ig_username?: string;
  download_url?: string;
}

export class IgAudioApiError extends Error {}

export async function fetchIgAudio(opts: {
  igUserId: string;
  token: string;
  audioType?: "music" | "original_sound";
  searchQuery?: string;
  pageSize?: number;
  maxPages?: number;
  fetchImpl?: FetchLike;
}): Promise<IgAudioItem[]> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const out: IgAudioItem[] = [];
  let after: string | undefined;
  for (let page = 0; page < (opts.maxPages ?? 2); page++) {
    const q = new URLSearchParams({
      audio_type: opts.audioType ?? "music",
      ig_user_id: opts.igUserId,
      limit: String(opts.pageSize ?? 25),
      access_token: opts.token,
    });
    if (opts.searchQuery) q.set("search_query", opts.searchQuery);
    if (after) q.set("after", after);
    let json: { audio?: IgAudioItem[]; data?: IgAudioItem[]; paging?: { cursors?: { after?: string } }; error?: { message?: string; code?: number } };
    try {
      const res = await doFetch(`${FB_GRAPH}/ig_audio?${q.toString()}`);
      json = (await res.json()) as typeof json;
    } catch (e) {
      throw new IgAudioApiError(`ig_audio request failed: ${errMessage(e)}`);
    }
    if (json.error) throw new IgAudioApiError(`ig_audio error ${json.error.code ?? ""}: ${redactSecrets(json.error.message ?? "unknown")}`.slice(0, 400));
    const items = json.audio ?? json.data ?? [];
    for (const it of items) if (it && typeof it.audio_id === "string" && it.audio_id) out.push(it);
    after = json.paging?.cursors?.after;
    if (!after || items.length === 0) break;
  }
  return out;
}

export interface PickAudioOptions {
  candidates: IgAudioItem[];
  /** Length of the video in ms; null/undefined = unknown (duration is then not a criterion). */
  videoDurationMs?: number | null;
  /** audio_ids used in the last ~14 days — never picked again. */
  recentIds?: Iterable<string>;
  /** Hard filter: only tracks with is_ads_eligible === true. */
  requireAdsEligible?: boolean;
  /** 0..1 — picks randomly among the first `topN` of the best non-empty tier. */
  rng?: () => number;
  topN?: number;
}

export interface PickedAudio {
  item: IgAudioItem;
  /** Which preference tier the pick came from (for logs / tests). */
  tier: "eligible_long_enough" | "long_enough" | "eligible_short" | "any";
}

/**
 * Selection rules, in order:
 *   1. drop duplicates, items without an id, and ids used recently;
 *   2. optional hard filter on is_ads_eligible;
 *   3. tiers: [ads-eligible AND duration >= video] > [duration >= video] > [ads-eligible] > [anything];
 *      the first non-empty tier wins (a track at least as long as the reel is preferred, so the sound
 *      does not end mid-reel; commercial-safe is preferred over merely trending);
 *   4. inside the tier keep Meta's trending order but pick randomly among the top N (default 5) so
 *      consecutive days differ.
 */
export function pickAudio(o: PickAudioOptions): PickedAudio | null {
  const recent = new Set(o.recentIds ?? []);
  const seen = new Set<string>();
  let pool = o.candidates.filter((c) => {
    if (!c?.audio_id || seen.has(c.audio_id) || recent.has(c.audio_id)) return false;
    seen.add(c.audio_id);
    return true;
  });
  if (o.requireAdsEligible) pool = pool.filter((c) => c.is_ads_eligible === true);
  if (pool.length === 0) return null;

  const need = o.videoDurationMs && o.videoDurationMs > 0 ? o.videoDurationMs : 0;
  const longEnough = (c: IgAudioItem) => (c.duration_in_ms ?? 0) >= need && (need === 0 || c.duration_in_ms !== undefined);
  const eligible = (c: IgAudioItem) => c.is_ads_eligible === true;

  const tiers: Array<[PickedAudio["tier"], IgAudioItem[]]> = [
    ["eligible_long_enough", pool.filter((c) => eligible(c) && longEnough(c))],
    ["long_enough", pool.filter(longEnough)],
    ["eligible_short", pool.filter(eligible)],
    ["any", pool],
  ];
  for (const [tier, list] of tiers) {
    if (list.length === 0) continue;
    const n = Math.min(o.topN ?? 5, list.length);
    const idx = Math.min(n - 1, Math.floor((o.rng ?? Math.random)() * n));
    return { item: list[idx], tier };
  }
  return null;
}

export const DEFAULT_AUDIO_VOLUME = 80;
export const DEFAULT_VIDEO_VOLUME = 15;

/**
 * The `audio_configuration` container parameter, exactly as in Meta's Audio API docs:
 *   audio_configuration={"audio_id":"<id>","audio_volume":80,"video_volume":15}
 * Volumes are integers 0/1..100 (docs differ on whether 0 is allowed; we always send >= 1).
 */
export function buildAudioConfiguration(audioId: string, audioVolume = DEFAULT_AUDIO_VOLUME, videoVolume = DEFAULT_VIDEO_VOLUME): string {
  const clamp = (v: number) => Math.max(1, Math.min(100, Math.round(v)));
  return JSON.stringify({ audio_id: audioId, audio_volume: clamp(audioVolume), video_volume: clamp(videoVolume) });
}

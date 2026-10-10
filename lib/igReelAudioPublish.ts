/**
 * Hybrid reel publishing with trending audio (Phase 3).
 *
 * Reels are published through the Facebook-Login Graph API (graph.facebook.com/v25.0) with a PAGE token
 * so that `audio_configuration` is available. The existing Instagram-Login path in
 * app/api/publish/post-now/route.ts is untouched and is the FALLBACK for every failure of this path.
 *
 * Flow: token -> trending audio list -> pickAudio() -> POST /{ig}/media (REELS + audio_configuration)
 *       -> poll status_code -> POST /{ig}/media_publish.
 *
 * Failure contract: every failure throws AudioPublishError with a `stage`. `ambiguous === true` only when
 * media_publish itself failed in a way where the reel MAY have been published (network error / timeout /
 * non-JSON body). The caller must NOT fall back in that case (it would double-post); every other
 * failure happened before anything was published, so falling back is safe.
 */
import { FB_GRAPH, errMessage, redactSecrets, resolveFbPageToken } from "./fbToken";
import { buildAudioConfiguration, fetchIgAudio, pickAudio, type IgAudioItem } from "./igAudio";
import { resolveAudioMode, trendingRequested, trendingTopN, type AudioMode, type AudioModeReason } from "./igAudioMode";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AudioPublishStage = "config" | "token" | "audio_list" | "no_audio" | "container" | "processing" | "copyright" | "publish";

export class AudioPublishError extends Error {
  constructor(
    public stage: AudioPublishStage,
    message: string,
    public ambiguous = false
  ) {
    super(redactSecrets(message));
    this.name = "AudioPublishError";
  }
  /** Phase 7: every audio attempt that failed before this error (e.g. the trending try before a library retry). */
  attempts: AudioAttemptFailure[] = [];
}

export interface AudioAttemptFailure {
  mode: AudioMode;
  stage: AudioPublishStage;
  reason: string;
  audioId?: string;
}

/* ── Flag resolution ────────────────────────────────────────────────────────── */

/**
 * IG_TRENDING_AUDIO_ENABLED=false  -> hard OFF (kill switch, no DB read)
 * IG_TRENDING_AUDIO_ENABLED=true   -> ON for every character
 * unset / anything else            -> the character's feature flag `ig_trending_audio` decides (default OFF)
 */
export async function isTrendingAudioEnabled(
  loadCharacterFlag: () => Promise<boolean>,
  env: Env = process.env
): Promise<boolean> {
  const v = env.IG_TRENDING_AUDIO_ENABLED?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "off") return false;
  if (v === "true" || v === "1" || v === "on") return true;
  try {
    return await loadCharacterFlag();
  } catch {
    return false;
  }
}

/* ── Publish ───────────────────────────────────────────────────────────────── */

export interface PublishedAudio {
  id: string;
  title: string | null;
  artist: string | null;
  durationMs: number | null;
  adsEligible: boolean | null;
  tier: string;
}

export interface AudioPublishResult {
  mediaId: string;
  audio: PublishedAudio;
  /** Phase 7: the mode the published track came from, what was requested, and failed attempts before it. */
  mode: AudioMode;
  requestedMode: AudioMode;
  modeReason: AudioModeReason;
  fallbacks: AudioAttemptFailure[];
  /** Best-effort pre-publish container copyright check (trending only); null = not checked/unknown. */
  containerCopyright: { status: string | null; matchesFound: boolean | null } | null;
}

export interface AudioPublishDeps {
  env?: Env;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** audio_ids published in the last ~14 days. Failure here must not block publishing -> treat as []. */
  loadRecentAudioIds?: () => Promise<string[]>;
  /** video length in ms or null when unknown. */
  probeDurationMs?: (videoUrl: string) => Promise<number | null>;
  rng?: () => number;
  /** Phase 7: per-character "trending got muted" lock (feature_flags.ig_audio_trending_muted). Failure -> false. */
  loadTrendingLock?: () => Promise<boolean>;
  now?: () => Date;
  /** polling cadence / budget — container processing normally takes 10-60 s. */
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const j = await res.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function apiErrorText(j: Record<string, unknown> | null): string {
  const e = j?.error as { message?: string; code?: number; error_subcode?: number } | undefined;
  if (!e) return "unexpected response";
  return `${e.code ?? ""}${e.error_subcode ? "/" + e.error_subcode : ""} ${e.message ?? ""}`.trim();
}

export async function publishReelWithAudio(
  input: { videoUrl: string; caption: string },
  deps: AudioPublishDeps = {}
): Promise<AudioPublishResult> {
  const env = deps.env ?? process.env;
  const doFetch: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? 5000;
  const maxWaitMs = deps.maxWaitMs ?? 150_000;

  const igUserId = env.FB_IG_USER_ID?.trim();
  if (!igUserId) throw new AudioPublishError("config", "FB_IG_USER_ID not set");

  // 1. token
  let page;
  try {
    page = await resolveFbPageToken({ env, fetchImpl: doFetch });
  } catch (e) {
    throw new AudioPublishError("token", `page token: ${errMessage(e)}`);
  }
  if (!page) throw new AudioPublishError("token", "no FB page token (FB_PAGE_ACCESS_TOKEN / FB_LONG_LIVED_USER_TOKEN)");
  const token = page.token;

  // 2. mode (phase 7). Default = library = the unchanged pre-phase-7 path.
  const now = (deps.now ?? (() => new Date()))();
  let locked = false;
  if (trendingRequested(env, now) && deps.loadTrendingLock) {
    try {
      locked = await deps.loadTrendingLock();
    } catch (e) {
      console.warn(`[ig-audio] trending lock unavailable (${errMessage(e)}); assuming not locked`);
    }
  }
  const decision = resolveAudioMode(env, now, { trendingLocked: locked });
  if (decision.reason !== "default_library" && decision.reason !== "env_library" && decision.reason !== "env_trending") {
    console.warn(`[ig-audio] trending requested but using library: ${decision.reason}`);
  }

  let recentIds: string[] = [];
  try {
    recentIds = (await deps.loadRecentAudioIds?.()) ?? [];
  } catch (e) {
    console.warn(`[ig-audio] recent audio ids unavailable (${errMessage(e)}); continuing without repeat protection`);
  }
  let videoDurationMs: number | null = null;
  try {
    videoDurationMs = (await deps.probeDurationMs?.(input.videoUrl)) ?? null;
  } catch {
    videoDurationMs = null;
  }

  const ctx: AttemptCtx = { env, doFetch, sleep, pollIntervalMs, maxWaitMs, igUserId, token, input, recentIds, videoDurationMs, rng: deps.rng };

  if (decision.mode === "trending") {
    let failure: AudioAttemptFailure;
    try {
      const r = await publishAttempt(ctx, "trending", []);
      return { ...r, mode: "trending", requestedMode: "trending", modeReason: decision.reason, fallbacks: [] };
    } catch (e) {
      if (e instanceof AudioPublishError && e.ambiguous) throw e; // may already be live — never retry
      failure = {
        mode: "trending",
        stage: e instanceof AudioPublishError ? e.stage : "container",
        reason: errMessage(e).slice(0, 300),
        audioId: (e as { audioId?: string }).audioId,
      };
      console.warn(`[ig-audio] trending attempt failed at ${failure.stage}: ${failure.reason} — retrying once with a library track`);
    }
    try {
      const r = await publishAttempt(ctx, "library", failure.audioId ? [failure.audioId] : []);
      return { ...r, mode: "library", requestedMode: "trending", modeReason: decision.reason, fallbacks: [failure] };
    } catch (e) {
      const err = e instanceof AudioPublishError ? e : new AudioPublishError("container", errMessage(e));
      err.attempts = [failure, { mode: "library", stage: err.stage, reason: err.message.slice(0, 300) }];
      throw err;
    }
  }

  const r = await publishAttempt(ctx, "library", []);
  return { ...r, mode: "library", requestedMode: "library", modeReason: decision.reason, fallbacks: [] };
}

interface AttemptCtx {
  env: Env;
  doFetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  pollIntervalMs: number;
  maxWaitMs: number;
  igUserId: string;
  token: string;
  input: { videoUrl: string; caption: string };
  recentIds: string[];
  videoDurationMs: number | null;
  rng?: () => number;
}

type AttemptResult = Pick<AudioPublishResult, "mediaId" | "audio" | "containerCopyright">;

function withAudioId<T extends AudioPublishError>(e: T, audioId: string): T {
  (e as unknown as { audioId?: string }).audioId = audioId;
  return e;
}

async function publishAttempt(ctx: AttemptCtx, mode: AudioMode, excludeIds: string[]): Promise<AttemptResult> {
  const { env, doFetch, sleep, pollIntervalMs, maxWaitMs, igUserId, token, input } = ctx;

  // audio list: library = IG_AUDIO_SEARCH_QUERY sound collection (pre-phase-7 behaviour);
  // trending = no search_query -> Meta's trending music list for this IG user.
  const searchQuery = mode === "library" ? env.IG_AUDIO_SEARCH_QUERY?.trim() || undefined : undefined;
  let candidates: IgAudioItem[];
  try {
    candidates = await fetchIgAudio({ igUserId, token, audioType: "music", searchQuery, fetchImpl: doFetch });
  } catch (e) {
    throw new AudioPublishError("audio_list", errMessage(e));
  }
  const picked = pickAudio({
    candidates,
    videoDurationMs: ctx.videoDurationMs,
    recentIds: ctx.recentIds,
    excludeIds,
    // trending: keep Meta's trending order, never rank commercial-safe tracks first, and ignore
    // IG_AUDIO_REQUIRE_ADS_ELIGIBLE (trending commercial music is is_ads_eligible=false by nature).
    requireAdsEligible: mode === "library" && env.IG_AUDIO_REQUIRE_ADS_ELIGIBLE?.trim().toLowerCase() === "true",
    preferAdsEligible: mode === "trending" ? false : undefined,
    topN: mode === "trending" ? trendingTopN(env) : undefined,
    rng: ctx.rng,
  });
  if (!picked) throw new AudioPublishError("no_audio", `no usable ${mode} audio (candidates=${candidates.length}, recent=${ctx.recentIds.length})`);
  const audio: PublishedAudio = {
    id: picked.item.audio_id,
    title: picked.item.title ?? null,
    artist: picked.item.display_artist ?? null,
    durationMs: picked.item.duration_in_ms ?? null,
    adsEligible: typeof picked.item.is_ads_eligible === "boolean" ? picked.item.is_ads_eligible : null,
    tier: picked.tier,
  };

  // 3. container
  const params = new URLSearchParams({
    media_type: "REELS",
    video_url: input.videoUrl,
    caption: input.caption,
    share_to_feed: "true",
    audio_configuration: buildAudioConfiguration(audio.id),
    access_token: token,
  });
  if (env.IG_SET_AI_GENERATED?.trim().toLowerCase() === "true") params.append("is_ai_generated", "true");

  let containerId: string;
  try {
    const res = await doFetch(`${FB_GRAPH}/${igUserId}/media`, { method: "POST", body: params });
    const j = await readJson(res);
    if (!j || typeof j.id !== "string") throw new Error(apiErrorText(j));
    containerId = j.id;
  } catch (e) {
    throw withAudioId(new AudioPublishError("container", errMessage(e)), audio.id);
  }

  // 4. processing
  let waited = 0;
  let finished = false;
  while (waited < maxWaitMs) {
    await sleep(pollIntervalMs);
    waited += pollIntervalMs;
    let j: Record<string, unknown> | null;
    try {
      const res = await doFetch(`${FB_GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
      j = await readJson(res);
    } catch (e) {
      throw withAudioId(new AudioPublishError("processing", errMessage(e)), audio.id);
    }
    const code = j?.status_code;
    if (code === "FINISHED") {
      finished = true;
      break;
    }
    if (code === "ERROR" || code === "EXPIRED") {
      throw withAudioId(new AudioPublishError("processing", `container ${String(code)}: ${redactSecrets(String(j?.status ?? "no detail"))}`), audio.id);
    }
    // IN_PROGRESS / PUBLISHED(unexpected) / transient API error -> keep polling
  }
  if (!finished) throw withAudioId(new AudioPublishError("processing", `container not FINISHED after ${Math.round(maxWaitMs / 1000)}s`), audio.id);

  // 4b. trending only: best-effort container copyright pre-check (IG Container field
  // copyright_check_status). A confirmed match aborts BEFORE publishing (nothing is live yet) so the
  // caller can retry with a library track. Unknown / in_progress / unsupported never blocks.
  let containerCopyright: AttemptResult["containerCopyright"] = null;
  if (mode === "trending") {
    try {
      const res = await doFetch(`${FB_GRAPH}/${containerId}?fields=copyright_check_status&access_token=${encodeURIComponent(token)}`);
      const j = await readJson(res);
      const c = j?.copyright_check_status as { status?: unknown; matches_found?: unknown } | undefined;
      if (c && typeof c === "object") {
        containerCopyright = {
          status: typeof c.status === "string" ? c.status : null,
          matchesFound: typeof c.matches_found === "boolean" ? c.matches_found : null,
        };
      }
    } catch {
      containerCopyright = null;
    }
    if (containerCopyright?.matchesFound === true) {
      throw withAudioId(new AudioPublishError("copyright", `container copyright_check_status matches_found=true (status=${containerCopyright.status ?? "?"})`), audio.id);
    }
  }

  // 5. publish — the only step where a failure can leave a published reel behind
  let res: Response;
  try {
    res = await doFetch(`${FB_GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: containerId, access_token: token }),
    });
  } catch (e) {
    throw new AudioPublishError("publish", `network error during media_publish: ${errMessage(e)}`, true);
  }
  const pj = await readJson(res);
  if (!pj) throw new AudioPublishError("publish", `non-JSON media_publish response (HTTP ${res.status})`, true);
  if (typeof pj.id !== "string") {
    // A JSON error object without an id = Meta rejected the publish; nothing was posted.
    throw withAudioId(new AudioPublishError("publish", apiErrorText(pj), false), audio.id);
  }
  return { mediaId: pj.id, audio, containerCopyright };
}

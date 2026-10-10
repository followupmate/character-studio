/**
 * Phase 7 — post-publish copyright / mute check for FB-path reels with attached audio.
 *
 * Graph API (Instagram API with Facebook Login, "Copyright Detection"):
 *   GET /{ig-media-id}?fields=copyright_check_information
 *   -> { copyright_check_information: { status: { status: completed|error|in_progress|not_started,
 *        matches_found: bool }, copyright_matches?: [ { author, content_title, matched_segments:[{segment_type:
 *        AUDIO|VIDEO, ...}], owner_copyright_policy: { name, actions: [ { action: MUTE|BLOCK, geos:[...] } ] } } ] } }
 *
 * What this CAN see: Meta's copyright-match result for the published media and the owner's mitigation
 * (MUTE / BLOCK + geos). What it CANNOT see: a silent "audio unavailable" swap, regional music-licence
 * greying, or reach throttling without a copyright match — those only show up as insight anomalies.
 *
 * Runs on the 15-min publish cron tick: max `limit` posts per tick, each re-checked at most every
 * `recheckMinutes`, until the check is `completed` or the post is older than 48 h. A restricted
 * TRENDING reel locks the character to library for the rest of the test (feature_flags key).
 */
import { FB_GRAPH, errMessage, redactSecrets, resolveFbPageToken } from "./fbToken";

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CopyrightInfo {
  status: string | null;
  matchesFound: boolean | null;
  actions: Array<{ action: string; geos: number }>;
  audioSegments: number;
  restricted: boolean;
}

export function parseCopyrightInfo(j: unknown): CopyrightInfo | null {
  const root = (j as { copyright_check_information?: unknown } | null)?.copyright_check_information as
    | { status?: { status?: unknown; matches_found?: unknown }; copyright_matches?: unknown }
    | undefined;
  if (!root || typeof root !== "object") return null;
  const status = typeof root.status?.status === "string" ? root.status.status : null;
  const matchesFound = typeof root.status?.matches_found === "boolean" ? root.status.matches_found : null;
  const actions: CopyrightInfo["actions"] = [];
  let audioSegments = 0;
  const matches = Array.isArray(root.copyright_matches) ? root.copyright_matches : [];
  for (const m of matches as Array<Record<string, unknown>>) {
    const segs = Array.isArray(m?.matched_segments) ? (m.matched_segments as Array<{ segment_type?: string }>) : [];
    audioSegments += segs.filter((s) => s?.segment_type === "AUDIO").length;
    const acts = (m?.owner_copyright_policy as { actions?: unknown } | undefined)?.actions;
    for (const a of Array.isArray(acts) ? (acts as Array<{ action?: unknown; geos?: unknown }>) : []) {
      if (typeof a?.action === "string") actions.push({ action: a.action, geos: Array.isArray(a.geos) ? a.geos.length : 0 });
    }
  }
  // Any confirmed match is treated as restricted for the test (MUTE/BLOCK in some geos, or a match
  // whose mitigation Meta did not spell out). Conservative on purpose: the test reverts to library.
  const restricted = matchesFound === true || actions.some((a) => a.action === "MUTE" || a.action === "BLOCK");
  return { status, matchesFound, actions, audioSegments, restricted };
}

export interface SweepCandidate {
  id: string;
  character_id: string | null;
  platform_post_id: string;
  posted_at: string;
  audio_meta: Record<string, unknown>;
}

export interface SweepDeps {
  env?: Env;
  now?: Date;
  fetchImpl?: FetchLike;
  loadCandidates: (now: Date) => Promise<SweepCandidate[]>;
  saveResult: (postId: string, patch: Record<string, unknown>) => Promise<void>;
  lockTrending: (characterId: string, info: { postId: string; reason: string }) => Promise<void>;
  limit?: number;
  recheckMinutes?: number;
}

export interface SweepResult {
  checked: number;
  restricted: string[];
  locked: string[];
  skipped?: string;
  errors: string[];
}

const FINAL_AFTER_MS = 48 * 3_600_000;

export async function runAudioCopyrightSweep(deps: SweepDeps): Promise<SweepResult> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? new Date();
  const doFetch: FetchLike = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const out: SweepResult = { checked: 0, restricted: [], locked: [], errors: [] };

  const all = await deps.loadCandidates(now);
  const recheckMs = (deps.recheckMinutes ?? 30) * 60_000;
  const due = all.filter((c) => {
    const mode = c.audio_meta.mode;
    if (mode !== "trending" && mode !== "library") return false; // no audio attached -> nothing to check
    const cr = c.audio_meta.copyright as { final?: unknown; checked_at?: unknown } | undefined;
    if (cr?.final === true) return false;
    const last = typeof cr?.checked_at === "string" ? Date.parse(cr.checked_at) : NaN;
    return Number.isNaN(last) || now.getTime() - last >= recheckMs;
  });
  if (due.length === 0) return { ...out, skipped: "nothing due" };

  let token: string | null = null;
  try {
    token = (await resolveFbPageToken({ env, fetchImpl: doFetch }))?.token ?? null;
  } catch (e) {
    return { ...out, skipped: `token: ${errMessage(e)}`.slice(0, 200) };
  }
  if (!token) return { ...out, skipped: "no FB page token" };

  // trending first: those are the ones that can trigger the lock
  due.sort((a, b) => (a.audio_meta.mode === "trending" ? 0 : 1) - (b.audio_meta.mode === "trending" ? 0 : 1));
  for (const c of due.slice(0, deps.limit ?? 3)) {
    try {
      const res = await doFetch(`${FB_GRAPH}/${c.platform_post_id}?fields=copyright_check_information&access_token=${encodeURIComponent(token)}`, {
        signal: AbortSignal.timeout(8000),
      });
      const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
      if (j?.error) throw new Error(`graph ${j.error.code ?? ""}: ${redactSecrets(j.error.message ?? "error")}`);
      const info = parseCopyrightInfo(j);
      const age = now.getTime() - Date.parse(c.posted_at);
      const final = info?.status === "completed" || age >= FINAL_AFTER_MS;
      await deps.saveResult(c.id, {
        copyright: {
          checked_at: now.toISOString(),
          status: info?.status ?? "unavailable",
          matches_found: info?.matchesFound ?? null,
          actions: info?.actions ?? [],
          audio_segments: info?.audioSegments ?? 0,
          restricted: info?.restricted ?? false,
          final,
        },
      });
      out.checked++;
      if (info?.restricted) {
        out.restricted.push(c.id);
        console.warn(`[audio-copyright] post ${c.id} (${String(c.audio_meta.mode)}) restricted: ${JSON.stringify(info.actions)}`);
        if (c.audio_meta.mode === "trending" && c.character_id) {
          await deps.lockTrending(c.character_id, { postId: c.id, reason: `copyright ${info.actions.map((a) => a.action).join("/") || "match"}` });
          out.locked.push(c.character_id);
        }
      }
    } catch (e) {
      out.errors.push(`${c.id}: ${errMessage(e)}`.slice(0, 200));
    }
  }
  return out;
}

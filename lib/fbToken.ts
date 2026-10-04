/**
 * Facebook-Login side of the Instagram integration (Phase 3, trending audio).
 *
 * The Audio API (GET /ig_audio, audio_configuration on reel containers) only exists on the
 * "Instagram API with Facebook Login". The rest of the app keeps using the Instagram-Login token
 * (lib/igToken.ts) — this module only resolves / checks the FACEBOOK PAGE token used for the
 * hybrid reel publish.
 *
 * Token handling rules:
 *   - tokens are never logged, never put in a thrown message, never returned from a route;
 *   - every error string goes through redactSecrets() before it leaves this module.
 */

export const FB_GRAPH_VERSION = "v25.0";
export const FB_GRAPH = `https://graph.facebook.com/${FB_GRAPH_VERSION}`;

type Env = Record<string, string | undefined>;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Strips access tokens / secrets from any string (URLs in fetch errors, API error bodies...). */
export function redactSecrets(text: string): string {
  return text
    .replace(/(access_token|input_token|client_secret|fb_exchange_token)=([^&\s"']+)/gi, "$1=REDACTED")
    .replace(/\b(EAA[A-Za-z0-9_-]{20,}|IGAA[A-Za-z0-9_-]{20,}|[0-9]{8,}\|[A-Za-z0-9_-]{16,})\b/g, "REDACTED");
}

export function errMessage(e: unknown): string {
  return redactSecrets(e instanceof Error ? e.message : String(e)).slice(0, 400);
}

export type FbPageTokenSource = "env_page_token" | "derived_from_user_token";
export interface FbPageToken {
  token: string;
  source: FbPageTokenSource;
}

let derived: { key: string; token: string; expiresAt: number } | null = null;
/** Test hook. */
export function _resetFbTokenCache(): void {
  derived = null;
}

/**
 * Page token for the IG business account:
 *   1. FB_PAGE_ACCESS_TOKEN (preferred — a page token derived from a long-lived user token never expires);
 *   2. else FB_LONG_LIVED_USER_TOKEN -> GET me/accounts, pick the page linked to FB_IG_USER_ID
 *      (or FB_PAGE_ID) and use its access_token. Cached in-process for 10 minutes.
 * Returns null when nothing is configured or the page cannot be found (caller falls back).
 */
export async function resolveFbPageToken(
  opts: { env?: Env; fetchImpl?: FetchLike; now?: () => number } = {}
): Promise<FbPageToken | null> {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const now = opts.now ?? Date.now;

  const direct = env.FB_PAGE_ACCESS_TOKEN?.trim();
  if (direct) return { token: direct, source: "env_page_token" };

  const user = env.FB_LONG_LIVED_USER_TOKEN?.trim();
  if (!user) return null;

  const igUserId = env.FB_IG_USER_ID?.trim();
  const pageId = env.FB_PAGE_ID?.trim();
  const key = `${igUserId ?? ""}|${pageId ?? ""}|${user.length}:${user.slice(-6)}`;
  if (derived && derived.key === key && derived.expiresAt > now()) return { token: derived.token, source: "derived_from_user_token" };

  const url = `${FB_GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${encodeURIComponent(user)}`;
  let body: { data?: Array<{ id: string; access_token?: string; instagram_business_account?: { id?: string } }>; error?: { message?: string } };
  try {
    const res = await doFetch(url);
    body = (await res.json()) as typeof body;
  } catch (e) {
    throw new Error(`me/accounts failed: ${errMessage(e)}`);
  }
  if (body.error) throw new Error(`me/accounts error: ${redactSecrets(body.error.message ?? "unknown")}`);

  const pages = body.data ?? [];
  const page =
    (igUserId && pages.find((p) => p.instagram_business_account?.id === igUserId)) ||
    (pageId && pages.find((p) => p.id === pageId)) ||
    undefined;
  if (!page?.access_token) return null;

  derived = { key, token: page.access_token, expiresAt: now() + 10 * 60_000 };
  return { token: page.access_token, source: "derived_from_user_token" };
}

/* ── Token health (debug_token) ─────────────────────────────────────────────── */

export interface DebugTokenData {
  is_valid?: boolean;
  type?: string; // "PAGE" | "USER"
  app_id?: string;
  /** unix seconds; 0 = never expires */
  expires_at?: number;
  /** unix seconds; the 90-day data-access window (renews on use) */
  data_access_expires_at?: number;
  scopes?: string[];
  error?: { message?: string };
}

export type TokenHealthStatus = "ok" | "never_expires" | "expiring_soon" | "expired" | "invalid" | "unknown";

export interface TokenHealth {
  status: TokenHealthStatus;
  type: string | null;
  isValid: boolean;
  /** ISO string, null when the token never expires / unknown */
  expiresAt: string | null;
  daysLeft: number | null;
  dataAccessDaysLeft: number | null;
  scopes: string[];
  detail?: string;
}

export const EXPIRING_SOON_DAYS = 14;
export const REQUIRED_SCOPES = ["instagram_basic", "instagram_content_publish", "pages_show_list"];

/** Pure classification of a debug_token `data` object. */
export function classifyTokenHealth(d: DebugTokenData | null | undefined, nowMs: number = Date.now()): TokenHealth {
  if (!d) return { status: "unknown", type: null, isValid: false, expiresAt: null, daysLeft: null, dataAccessDaysLeft: null, scopes: [], detail: "no data" };
  const scopes = d.scopes ?? [];
  const dataAccessDaysLeft =
    d.data_access_expires_at && d.data_access_expires_at > 0
      ? Math.floor((d.data_access_expires_at * 1000 - nowMs) / 86_400_000)
      : null;
  const base = { type: d.type ?? null, scopes, dataAccessDaysLeft };
  if (d.is_valid === false) {
    return { ...base, status: "invalid", isValid: false, expiresAt: null, daysLeft: null, detail: redactSecrets(d.error?.message ?? "token invalid") };
  }
  if (!d.expires_at || d.expires_at === 0) {
    const missing = REQUIRED_SCOPES.filter((s) => scopes.length > 0 && !scopes.includes(s));
    return { ...base, status: "never_expires", isValid: true, expiresAt: null, daysLeft: null, ...(missing.length ? { detail: `missing scopes: ${missing.join(", ")}` } : {}) };
  }
  const daysLeft = Math.floor((d.expires_at * 1000 - nowMs) / 86_400_000);
  const expiresAt = new Date(d.expires_at * 1000).toISOString();
  if (daysLeft < 0) return { ...base, status: "expired", isValid: false, expiresAt, daysLeft };
  return { ...base, status: daysLeft < EXPIRING_SOON_DAYS ? "expiring_soon" : "ok", isValid: true, expiresAt, daysLeft };
}

/** GET /debug_token using the app access token (APP_ID|APP_SECRET). Never returns the token. */
export async function checkTokenHealth(
  inputToken: string,
  opts: { env?: Env; fetchImpl?: FetchLike; now?: () => number } = {}
): Promise<TokenHealth> {
  const env = opts.env ?? process.env;
  const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const appId = env.FB_APP_ID?.trim();
  const appSecret = env.FB_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    return { status: "unknown", type: null, isValid: false, expiresAt: null, daysLeft: null, dataAccessDaysLeft: null, scopes: [], detail: "FB_APP_ID / FB_APP_SECRET not configured" };
  }
  try {
    const url = `${FB_GRAPH}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res = await doFetch(url);
    const json = (await res.json()) as { data?: DebugTokenData; error?: { message?: string } };
    if (json.error) {
      return { status: "unknown", type: null, isValid: false, expiresAt: null, daysLeft: null, dataAccessDaysLeft: null, scopes: [], detail: redactSecrets(json.error.message ?? "debug_token error") };
    }
    return classifyTokenHealth(json.data, (opts.now ?? Date.now)());
  } catch (e) {
    return { status: "unknown", type: null, isValid: false, expiresAt: null, daysLeft: null, dataAccessDaysLeft: null, scopes: [], detail: errMessage(e) };
  }
}

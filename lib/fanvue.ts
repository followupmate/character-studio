import { supabase } from "@/lib/supabase";

// Fanvue API client (server-side) — the engine's "last mile" to revenue.
//
// Auth: Fanvue is OAuth-2.0-only (no API keys). One-time setup: create an app in
// the Fanvue Builder area, put FANVUE_CLIENT_ID + FANVUE_CLIENT_SECRET into env,
// then visit /api/auth/fanvue once to authorize — tokens land in chs_oauth_tokens
// and refresh automatically from then on (rotation-safe: a rotated refresh_token
// is written back to the DB).
//
// Verified endpoints:
//   auth:  https://auth.fanvue.com/oauth2/auth + /oauth2/token (PKCE mandatory)
//   POST  /chats/mass-messages — mass message (text, mediaUuids, price cents ≥300)
//   POST  /posts               — create post (audience, text, mediaUuids, price)
//   upload flow (shapes verified against the live API, 2026-07-25):
//     POST  /medias/uploads                      → { mediaUuid, uploadId, partSize, maxParts, totalParts }
//     GET   /medias/uploads/{uploadId}/parts/{n} → plain-text presigned S3 URL (NOT JSON)
//     PUT   <presigned URL> (raw bytes, NO extra headers) → 200 + ETag header
//     PATCH /medias/uploads/{uploadId} { parts: [{ PartNumber, ETag }] } → { status: "processing" }

const BASE = "https://api.fanvue.com";
const TOKEN_URL = "https://auth.fanvue.com/oauth2/token";
const API_VERSION = "2025-06-26";

export function fanvueConfigured(): boolean {
  return !!process.env.FANVUE_CLIENT_ID && !!process.env.FANVUE_CLIENT_SECRET;
}

// ── OAuth token management (DB-backed, auto-refresh) ───────────
interface TokenRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;

  const { data } = await supabase
    .from("chs_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "fanvue")
    .maybeSingle();
  const row = data as TokenRow | null;
  if (!row) throw new Error("Fanvue nie je autorizované — otvor /api/auth/fanvue a povoľ prístup");

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) {
    cached = { token: row.access_token, expiresAt };
    return row.access_token;
  }

  // Expired → refresh
  if (!row.refresh_token) throw new Error("Fanvue token expiroval a chýba refresh token — otvor /api/auth/fanvue znova");
  // Fanvue app is configured for client_secret_basic: client_id:client_secret go
  // in the HTTP Basic Authorization header, not the body.
  const basicAuth = Buffer.from(`${process.env.FANVUE_CLIENT_ID!}:${process.env.FANVUE_CLIENT_SECRET!}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });
  const tok = await res.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string;
  };
  if (!res.ok || !tok.access_token) {
    throw new Error(`Fanvue token refresh zlyhal (${res.status}): ${tok.error_description ?? tok.error ?? "?"} — otvor /api/auth/fanvue znova`);
  }

  await saveTokens({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token, // keep old one if not rotated
    expires_in: tok.expires_in ?? 3600,
  });
  return tok.access_token;
}

export async function saveTokens(t: { access_token: string; refresh_token: string | null; expires_in: number }): Promise<void> {
  const expiresAt = new Date(Date.now() + t.expires_in * 1000);
  cached = { token: t.access_token, expiresAt: expiresAt.getTime() };
  await supabase.from("chs_oauth_tokens").upsert({
    provider: "fanvue",
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}`, "X-Fanvue-API-Version": API_VERSION };
}

// ── HTTP helpers ───────────────────────────────────────────────
// `text` carries the full untruncated body — some endpoints (upload part-url)
// answer with a plain string instead of JSON, and `data.raw` is truncated.
async function fv(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(await authHeaders()), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data, text };
}

// Try path candidates in order; a 404/405 means "wrong path", anything else is the real answer.
async function fvFirst(
  method: string,
  paths: string[],
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; text: string; path: string }> {
  let last: { ok: boolean; status: number; data: Record<string, unknown>; text: string; path: string } | null = null;
  for (const path of paths) {
    const r = await fv(method, path, body);
    last = { ...r, path };
    if (r.status !== 404 && r.status !== 405) return last;
  }
  return last!;
}

function errDetail(r: { status: number; data: Record<string, unknown>; path?: string }): string {
  return `${r.status}${r.path ? ` ${r.path}` : ""}: ${JSON.stringify(r.data).slice(0, 300)}`;
}

// ── Media upload (3-step multipart) ────────────────────────────

// The part-url endpoint answers with the presigned URL as a bare plain-text string
// (verified live) — not a JSON object. Kept tolerant of a JSON-quoted string or an
// object wrapper in case the API shape shifts. Exported for tests.
export function extractPartUrl(bodyText: string): string | null {
  const text = bodyText.trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string" && parsed.startsWith("http")) return parsed;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      const u = o.url ?? o.uploadUrl ?? o.signedUrl;
      if (typeof u === "string" && u.startsWith("http")) return u;
    }
  } catch {
    if (text.startsWith("http")) return text;
  }
  return null;
}

export async function uploadImageFromUrl(sourceUrl: string, name: string): Promise<string> {
  // 0. Pull the image bytes from our storage
  const img = await fetch(sourceUrl);
  if (!img.ok) throw new Error(`Fanvue upload: source fetch failed ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const ext = sourceUrl.split("?")[0].toLowerCase().endsWith(".jpg") ? "jpg" : "png";
  const filename = `${name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60)}.${ext}`;

  // 1. Create upload session. Live shape: { mediaUuid, uploadId, partSize, maxParts, totalParts }
  // — both ids top-level; anything else is an API change worth failing loudly on.
  const create = await fvFirst("POST", ["/medias/uploads", "/medias/upload-sessions", "/media/uploads"], {
    name: name.slice(0, 255),
    filename,
    mediaType: "image",
    sizeBytes: buf.length,
  });
  if (!create.ok) throw new Error(`Fanvue create upload session: ${errDetail(create)}`);
  const uploadId = typeof create.data.uploadId === "string" ? create.data.uploadId : undefined;
  const mediaUuid = typeof create.data.mediaUuid === "string" ? create.data.mediaUuid : undefined;
  if (!uploadId || !mediaUuid) throw new Error(`Fanvue upload session: unexpected response ${JSON.stringify(create.data).slice(0, 300)}`);
  const sessionBase = create.path.replace(/\/$/, "");
  const partSizeRaw = Number(create.data.partSize);
  const partSize = Number.isFinite(partSizeRaw) && partSizeRaw > 0 ? partSizeRaw : buf.length;
  const totalPartsRaw = Number(create.data.totalParts);
  const totalParts = Number.isFinite(totalPartsRaw) && totalPartsRaw > 0
    ? totalPartsRaw
    : Math.max(1, Math.ceil(buf.length / partSize));

  // 2+3. Per part: presigned URL (path verified live: GET {sessionBase}/{uploadId}/parts/{n},
  // body is the URL as plain text), then PUT the slice.
  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  for (let n = 1; n <= totalParts; n++) {
    const partPath = `${sessionBase}/${uploadId}/parts/${n}`;
    const part = await fv("GET", partPath);
    if (!part.ok) throw new Error(`Fanvue part URL: ${errDetail({ ...part, path: partPath })}`);
    const partUrl = extractPartUrl(part.text);
    if (!partUrl) throw new Error(`Fanvue part URL: unexpected body ${part.text.slice(0, 200)}`);
    console.log(`[fanvue-upload] part ${n}/${totalParts} via ${partPath}`);

    // Raw bytes only, NO extra headers. The presigned URL signs only the host header
    // (X-Amz-SignedHeaders=host) and bakes x-amz-checksum-crc32 into the signed query —
    // verified live: a bare PUT returns 200 + ETag, while adding any x-amz-checksum-*
    // header fails with 403 "There were headers present in the request which were not signed".
    const chunk = buf.subarray((n - 1) * partSize, Math.min(n * partSize, buf.length));
    const put = await fetch(partUrl, { method: "PUT", body: new Uint8Array(chunk) });
    if (!put.ok) {
      const s3Error = await put.text().catch(() => "");
      throw new Error(`Fanvue S3 PUT failed ${put.status} (part ${n}/${totalParts}): ${s3Error.slice(0, 200)}`);
    }
    const etag = (put.headers.get("etag") ?? "").replace(/"/g, "");
    if (!etag) throw new Error("Fanvue S3 PUT: no ETag returned");
    parts.push({ PartNumber: n, ETag: etag });
  }

  // 4. Complete the session (live response: { status: "processing" })
  const complete = await fvFirst("PATCH", [`${sessionBase}/${uploadId}`, `${sessionBase}/${uploadId}/complete`], {
    parts,
  });
  if (!complete.ok) throw new Error(`Fanvue complete upload: ${errDetail(complete)}`);

  return mediaUuid;
}

// ── Posts & mass messages ──────────────────────────────────────
export interface FanvuePostArgs {
  text: string;
  mediaUuids: string[];
  audience: "subscribers" | "followers-and-subscribers";
  priceCents?: number;          // paid post; min 300 (=$3)
  mediaPreviewUuid?: string;    // free teaser for paid posts
}

export async function createFanvuePost(args: FanvuePostArgs): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    audience: args.audience,
    text: args.text.slice(0, 5000),
    mediaUuids: args.mediaUuids,
  };
  if (args.priceCents && args.priceCents >= 300) body.price = Math.round(args.priceCents);
  if (args.mediaPreviewUuid) body.mediaPreviewUuid = args.mediaPreviewUuid;

  const r = await fv("POST", "/posts", body);
  if (!r.ok) throw new Error(`Fanvue create post: ${errDetail({ ...r, path: "/posts" })}`);
  return r.data;
}

export interface FanvueMassMessageArgs {
  text: string;
  mediaUuids: string[];
  priceCents?: number;          // PPV price in cents, min 300
  smartLists?: string[];        // default: all subscribers
}

export async function sendFanvueMassMessage(args: FanvueMassMessageArgs): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    text: args.text.slice(0, 5000),
    mediaUuids: args.mediaUuids,
    includedLists: { smartListUuids: args.smartLists ?? ["subscribers"] },
  };
  if (args.priceCents && args.priceCents >= 300) body.price = Math.round(args.priceCents);

  const r = await fv("POST", "/chats/mass-messages", body);
  if (!r.ok) throw new Error(`Fanvue mass message: ${errDetail({ ...r, path: "/chats/mass-messages" })}`);
  return r.data;
}

// ── Account snapshot (Money Engine auto-refresh) ───────────────
// Best-effort: each sub-call fails independently; whatever succeeds lands in the
// snapshot. Shapes are read defensively (the docs portal hides exact schemas).

function num(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && v !== null && v !== undefined && v !== "") return n;
  }
  return undefined;
}

async function countOf(paths: string[]): Promise<number | undefined> {
  const r = await fvFirst("GET", paths);
  if (!r.ok) return undefined;
  const d = r.data as Record<string, unknown> & {
    pagination?: { total?: number; totalCount?: number };
    meta?: { total?: number };
    data?: unknown[];
  };
  return num(d.total, d.totalCount, d.count, d.pagination?.total, d.pagination?.totalCount, d.meta?.total)
    ?? (Array.isArray(d.data) ? d.data.length : undefined);
}

export interface FanvueAccountSnapshot {
  audited_at: string;
  handle?: string;
  display_name?: string;
  followers?: number;
  subscribers?: number;
  earnings_total?: number;
  errors?: string[];
}

export async function fetchFanvueSnapshot(): Promise<FanvueAccountSnapshot> {
  const snapshot: FanvueAccountSnapshot = { audited_at: new Date().toISOString() };
  const errors: string[] = [];

  const me = await fvFirst("GET", ["/users/me"]);
  if (me.ok) {
    const d = me.data as Record<string, unknown>;
    snapshot.handle = (d.handle ?? d.username ?? d.slug) as string | undefined;
    snapshot.display_name = (d.displayName ?? d.display_name ?? d.name) as string | undefined;
  } else errors.push(`me: ${errDetail(me)}`);

  const subs = await countOf(["/subscribers?page=1&size=1", "/subscribers"]);
  if (subs !== undefined) snapshot.subscribers = subs; else errors.push("subscribers: unavailable");

  const followers = await countOf(["/followers?page=1&size=1", "/followers"]);
  if (followers !== undefined) snapshot.followers = followers; else errors.push("followers: unavailable");

  const earn = await fvFirst("GET", ["/insights/earnings", "/insights/earnings-summary", "/insights/earnings/summary"]);
  if (earn.ok) {
    const d = earn.data as Record<string, unknown> & { total?: unknown; summary?: Record<string, unknown> };
    const total = num(
      d.total, d.totalEarnings, d.total_earnings, d.grossTotal, d.netTotal,
      d.summary?.total, d.summary?.gross, d.summary?.net
    );
    if (total !== undefined) snapshot.earnings_total = total;
    else errors.push(`earnings: unexpected shape ${JSON.stringify(d).slice(0, 150)}`);
  } else errors.push(`earnings: ${errDetail(earn)}`);

  if (errors.length) snapshot.errors = errors;
  return snapshot;
}

// ── Health probe (auth + connectivity) ─────────────────────────
export async function fanvueHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await fvFirst("GET", ["/users/me", "/me", "/users/self"]);
    return { ok: r.ok, detail: r.ok ? JSON.stringify(r.data).slice(0, 200) : errDetail(r) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

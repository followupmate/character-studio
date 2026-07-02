// Fanvue API client (server-side) — the engine's "last mile" to revenue.
// Auth: creator API key in X-Fanvue-API-Key (Creator Settings → Request API keys),
// or an OAuth bearer token when FANVUE_AUTH_BEARER=1. Every request carries
// X-Fanvue-API-Version (2025-06-26).
//
// Verified against the public API docs / MCP schema:
//   POST  /chats/mass-messages   — mass message (text, mediaUuids, price in cents ≥300, includedLists)
//   POST  /posts                 — create post (audience, text, mediaUuids, price cents, mediaPreviewUuid)
//   upload flow: POST create session → GET presigned part URL → PUT bytes → PATCH complete
// The exact upload-session paths aren't published outside the docs portal, so each
// step walks a small candidate list and remembers what worked (404/405 → next).

const BASE = "https://api.fanvue.com";
const API_VERSION = "2025-06-26";

export function fanvueConfigured(): boolean {
  return !!process.env.FANVUE_API_KEY;
}

function authHeaders(): Record<string, string> {
  const key = process.env.FANVUE_API_KEY;
  if (!key) throw new Error("FANVUE_API_KEY not configured (Vercel env)");
  const h: Record<string, string> = { "X-Fanvue-API-Version": API_VERSION };
  if (process.env.FANVUE_AUTH_BEARER === "1") h.Authorization = `Bearer ${key}`;
  else h["X-Fanvue-API-Key"] = key;
  return h;
}

async function fv(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...authHeaders(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, data };
}

// Try path candidates in order; a 404/405 means "wrong path", anything else is the real answer.
async function fvFirst(
  method: string,
  paths: string[],
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; path: string }> {
  let last: { ok: boolean; status: number; data: Record<string, unknown>; path: string } | null = null;
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
export async function uploadImageFromUrl(sourceUrl: string, name: string): Promise<string> {
  // 0. Pull the image bytes from our storage
  const img = await fetch(sourceUrl);
  if (!img.ok) throw new Error(`Fanvue upload: source fetch failed ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const ext = sourceUrl.split("?")[0].toLowerCase().endsWith(".jpg") ? "jpg" : "png";
  const filename = `${name.replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60)}.${ext}`;

  // 1. Create upload session
  const create = await fvFirst("POST", ["/medias/uploads", "/medias/upload-sessions", "/media/uploads"], {
    name: name.slice(0, 255),
    filename,
    mediaType: "image",
    sizeBytes: buf.length,
  });
  if (!create.ok) throw new Error(`Fanvue create upload session: ${errDetail(create)}`);
  const uploadId = (create.data.uploadId ?? create.data.upload_id ?? (create.data as { session?: { uploadId?: string } }).session?.uploadId) as string | undefined;
  const mediaUuid = (create.data.mediaUuid ?? create.data.media_uuid ?? (create.data as { media?: { uuid?: string } }).media?.uuid) as string | undefined;
  if (!uploadId || !mediaUuid) throw new Error(`Fanvue upload session: unexpected response ${JSON.stringify(create.data).slice(0, 300)}`);
  const sessionBase = create.path.replace(/\/$/, "");

  // 2. Presigned URL for part 1 (our images are far below the multipart 5MB minimum-part threshold)
  const part = await fvFirst("GET", [
    `${sessionBase}/${uploadId}/parts/1`,
    `${sessionBase}/${uploadId}/parts/1/url`,
    `${sessionBase}/${uploadId}/part-url/1`,
  ]);
  if (!part.ok) throw new Error(`Fanvue part URL: ${errDetail(part)}`);
  const partUrl = (part.data.url ?? part.data.uploadUrl ?? part.data.signedUrl) as string | undefined;
  if (!partUrl) throw new Error(`Fanvue part URL: unexpected response ${JSON.stringify(part.data).slice(0, 300)}`);

  // 3. PUT the bytes to S3, keep the ETag
  const put = await fetch(partUrl, { method: "PUT", body: new Uint8Array(buf) });
  if (!put.ok) throw new Error(`Fanvue S3 PUT failed ${put.status}`);
  const etag = (put.headers.get("etag") ?? "").replace(/"/g, "");
  if (!etag) throw new Error("Fanvue S3 PUT: no ETag returned");

  // 4. Complete the session
  const complete = await fvFirst("PATCH", [`${sessionBase}/${uploadId}`, `${sessionBase}/${uploadId}/complete`], {
    parts: [{ PartNumber: 1, ETag: etag }],
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

// ── Health probe (auth + connectivity) ─────────────────────────
export async function fanvueHealth(): Promise<{ ok: boolean; detail: string }> {
  const r = await fvFirst("GET", ["/users/me", "/me", "/users/self"]);
  return { ok: r.ok, detail: r.ok ? JSON.stringify(r.data).slice(0, 200) : errDetail(r) };
}

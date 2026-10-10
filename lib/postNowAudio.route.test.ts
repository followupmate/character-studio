import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Route-level behaviour of /api/publish/post-now after Phase 3: flag off = legacy Instagram-Login path only;
// flag on = Facebook-Login audio path with fallback to the legacy path on any pre-publish failure.

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  post: {} as Row,
  characterFlags: {} as Row,
  recentAudio: [] as Array<{ audio_id: string }>,
  updates: [] as Array<{ table: string; payload: Row }>,
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const q: { op: string; payload: Row | null } = { op: "select", payload: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      gte: () => builder,
      update: (p: Row) => ((q.op = "update"), (q.payload = p), builder),
      single: async () => ({ data: state.post, error: null }),
      maybeSingle: async () => ({ data: table === "chs_characters" ? { feature_flags: state.characterFlags } : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (q.op === "update") {
          state.updates.push({ table, payload: q.payload as Row });
          resolve({ data: null, error: null });
        } else resolve({ data: table === "chs_posts" ? state.recentAudio : [], error: null });
      },
    };
    return builder;
  }
  return { supabase: { from } };
});
vi.mock("@/lib/igToken", () => ({ getIgAccessToken: async () => "IG_LOGIN_TOKEN" }));
vi.mock("@/lib/recovery/videoDuration", () => ({ probeVideoDuration: async () => ({ durationSec: 12 }) }));

import { POST } from "@/app/api/publish/post-now/route";
import { _resetFbTokenCache } from "@/lib/fbToken";
import { REEL_SHARE_LINES, pickReelShareLine } from "@/lib/captionTemplate";

const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const req = () => new Request("http://x/api/publish/post-now", { method: "POST", body: JSON.stringify({ post_id: "p1" }) });

let calls: Array<{ url: string; body: string }>;
let fb: { audio?: () => Response; container?: () => Response; status?: () => Response; publish?: () => Response };

function installFetch() {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? String(init.body) : "" });
    if (url.startsWith("https://graph.facebook.com/")) {
      if (url.includes("/ig_audio?")) return (fb.audio ?? (() => j({ audio: [{ audio_id: "A1", title: "Song", display_artist: "Artist", duration_in_ms: 90000, is_ads_eligible: false }] })))();
      if (url.endsWith("/FBIG/media")) return (fb.container ?? (() => j({ id: "FBC" })))();
      if (url.includes("/FBC?")) return (fb.status ?? (() => j({ status_code: "FINISHED" })))();
      if (url.endsWith("/FBIG/media_publish")) return (fb.publish ?? (() => j({ id: "FB_MEDIA" })))();
    }
    if (url.startsWith("https://graph.instagram.com/")) {
      if (url.endsWith("/LEGACYIG/media")) return j({ id: "LC" });
      if (url.includes("/LC?")) return j({ status_code: "FINISHED" });
      if (url.endsWith("/LEGACYIG/media_publish")) return j({ id: "LEGACY_MEDIA" });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}
const fbCalls = () => calls.filter((c) => c.url.startsWith("https://graph.facebook.com/"));
const igCalls = () => calls.filter((c) => c.url.startsWith("https://graph.instagram.com/"));
const postUpdates = () => state.updates.filter((u) => u.table === "chs_posts").map((u) => u.payload);

const SAVED = { ...process.env };
beforeEach(() => {
  state.post = { id: "p1", platform: "instagram", character_id: "c1", ig_caption: "hi", hashtags: [], chs_media: { type: "video", media_url: "https://cdn/v.mp4" } };
  state.characterFlags = {};
  state.recentAudio = [];
  state.updates = [];
  fb = {};
  _resetFbTokenCache();
  process.env = { ...SAVED, IG_USER_ID: "LEGACYIG", FB_IG_USER_ID: "FBIG", FB_PAGE_ACCESS_TOKEN: "PAGE_TOKEN_X" };
  delete process.env.IG_TRENDING_AUDIO_ENABLED;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => (fn(), 0)) as unknown as typeof setTimeout);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  installFetch();
});
afterEach(() => {
  process.env = SAVED;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("post-now — flag off (default): unchanged behaviour", () => {
  it("reel goes through graph.instagram.com only; graph.facebook.com is never called", async () => {
    const res = await POST(req());
    const body = await res.json();
    expect(body).toEqual({ success: true, platform_post_id: "LEGACY_MEDIA" });
    expect(fbCalls()).toHaveLength(0);
    expect(igCalls().length).toBeGreaterThan(0);
    expect(postUpdates()).toHaveLength(1);
    expect(postUpdates()[0]).toMatchObject({ status: "posted", platform_post_id: "LEGACY_MEDIA" });
    expect(postUpdates()[0]).not.toHaveProperty("audio_id");
  });

  it("env IG_TRENDING_AUDIO_ENABLED=false wins over a character flag that is on", async () => {
    state.characterFlags = { ig_trending_audio: true };
    process.env.IG_TRENDING_AUDIO_ENABLED = "false";
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("LEGACY_MEDIA");
    expect(fbCalls()).toHaveLength(0);
  });

  it("images never use the audio path, even with the flag on", async () => {
    state.characterFlags = { ig_trending_audio: true };
    state.post = { ...state.post, chs_media: { type: "image", media_url: "https://cdn/i.jpg" } };
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("LEGACY_MEDIA");
    expect(fbCalls()).toHaveLength(0);
  });
});

describe("post-now — flag on", () => {
  beforeEach(() => {
    state.characterFlags = { ig_trending_audio: true };
  });

  it("publishes via graph.facebook.com with audio and stores the audio on the post", async () => {
    const body = await (await POST(req())).json();
    expect(body).toEqual({ success: true, platform_post_id: "FB_MEDIA", audio_id: "A1" });
    expect(igCalls()).toHaveLength(0);
    const container = fbCalls().find((c) => c.url.endsWith("/FBIG/media"))!;
    expect(decodeURIComponent(container.body)).toContain('audio_configuration={"audio_id":"A1","audio_volume":80,"video_volume":15}');
    const ups = postUpdates();
    expect(ups[0]).toMatchObject({ status: "posted", platform_post_id: "FB_MEDIA" });
    expect(ups[1]).toMatchObject({ audio_id: "A1", audio_title: "Song", audio_artist: "Artist", audio_ads_eligible: false });
  });

  it("env true turns it on without the character flag", async () => {
    state.characterFlags = {};
    process.env.IG_TRENDING_AUDIO_ENABLED = "true";
    expect((await (await POST(req())).json()).platform_post_id).toBe("FB_MEDIA");
  });

  it("falls back to the legacy path when there is no FB token", async () => {
    delete process.env.FB_PAGE_ACCESS_TOKEN;
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("LEGACY_MEDIA");
    expect(fbCalls()).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("stage=token"));
  });

  it("falls back when ig_audio errors", async () => {
    fb.audio = () => j({ error: { code: 10, message: "denied" } }, 400);
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("LEGACY_MEDIA");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("stage=audio_list"));
    expect(postUpdates().some((u) => "audio_id" in u)).toBe(false);
  });

  it("falls back when the container request fails", async () => {
    fb.container = () => j({ error: { code: 100, message: "bad audio_configuration" } }, 400);
    expect((await (await POST(req())).json()).platform_post_id).toBe("LEGACY_MEDIA");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("stage=container"));
  });

  it("falls back when the container ends in status ERROR", async () => {
    fb.status = () => j({ status_code: "ERROR", status: "boom" });
    expect((await (await POST(req())).json()).platform_post_id).toBe("LEGACY_MEDIA");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("stage=processing"));
  });

  it("falls back when Meta clearly rejects media_publish", async () => {
    fb.publish = () => j({ error: { code: 9007, message: "not ready" } }, 400);
    expect((await (await POST(req())).json()).platform_post_id).toBe("LEGACY_MEDIA");
  });

  it("does NOT fall back when media_publish outcome is unknown (double-post guard)", async () => {
    fb.publish = () => new Response("<html>gateway timeout</html>", { status: 504 });
    const res = await POST(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("AUDIO_PUBLISH_AMBIGUOUS");
    expect(igCalls()).toHaveLength(0);
    expect(postUpdates()[0]).toMatchObject({ status: "failed" });
  });

  it("never lets a stored token appear in logs", async () => {
    fb.audio = () => { throw new Error("fetch failed ig_audio?access_token=PAGE_TOKEN_X"); };
    await POST(req());
    const logged = JSON.stringify((console.warn as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain("PAGE_TOKEN_X");
  });
});

describe("post-now — phase 5 reel share CTA", () => {
  const captionSent = () => {
    const c = igCalls().find((x) => x.url.endsWith("/LEGACYIG/media"))!;
    return new URLSearchParams(c.body).get("caption")!;
  };

  it("an IG reel caption ends with the share line for its scheduled (Bratislava) day; follow-CTA replaced", async () => {
    state.post = { ...state.post, ig_caption: "terrace, coffee.\nhere most days if this is your kind of quiet.", hashtags: ["ootd"], scheduled_at: "2026-10-07T16:00:00Z" };
    await POST(req());
    expect(captionSent()).toBe(`terrace, coffee.\n${pickReelShareLine("2026-10-07")}\n\n#ootd`);
  });

  it("keeps a share line written by from-batch (idempotent)", async () => {
    const line = REEL_SHARE_LINES[4];
    state.post = { ...state.post, ig_caption: `terrace, coffee.\n${line}`, hashtags: [], scheduled_at: "2026-10-07T16:00:00Z" };
    await POST(req());
    expect(captionSent()).toBe(`terrace, coffee.\n${line}`);
  });

  it("an image post caption is unchanged", async () => {
    state.post = { ...state.post, ig_caption: "terrace.\nhere most days if this is your kind of quiet.", hashtags: [], chs_media: { type: "image", media_url: "https://cdn/i.jpg" } };
    await POST(req());
    expect(captionSent()).toBe("terrace.\nhere most days if this is your kind of quiet.");
  });
});

describe("post-now — phase 7 audio mode bookkeeping (engagement.audio_meta)", () => {
  const metaUpdate = () => postUpdates().find((u) => "engagement" in u)?.engagement as Record<string, Record<string, unknown>> | undefined;
  beforeEach(() => {
    state.characterFlags = { ig_trending_audio: true };
    process.env.IG_AUDIO_MODE = "trending";
    process.env.IG_AUDIO_TRENDING_UNTIL = "2999-12-31";
  });

  it("trending publish stores audio columns + audio_meta.mode=trending", async () => {
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("FB_MEDIA");
    expect(fbCalls().find((c) => c.url.includes("/ig_audio?"))!.url).not.toContain("search_query");
    expect(postUpdates().find((u) => "audio_id" in u)).toMatchObject({ audio_id: "A1", audio_ads_eligible: false });
    expect(metaUpdate()?.audio_meta).toMatchObject({ mode: "trending", requested_mode: "trending", mode_reason: "env_trending", fallbacks: [] });
  });

  it("muted lock in feature_flags -> library, recorded as muted_lock", async () => {
    state.characterFlags = { ig_trending_audio: true, ig_audio_trending_muted: true };
    await POST(req());
    expect(metaUpdate()?.audio_meta).toMatchObject({ mode: "library", mode_reason: "muted_lock" });
  });

  it("trending + library both fail -> no-audio IG Login, audio_meta.mode=none with both attempts", async () => {
    fb.audio = () => j({ audio: [] });
    const body = await (await POST(req())).json();
    expect(body.platform_post_id).toBe("LEGACY_MEDIA");
    const meta = metaUpdate()?.audio_meta;
    expect(meta).toMatchObject({ mode: "none", requested_mode: "trending" });
    expect((meta!.fallbacks as unknown as unknown[]).length).toBe(2);
    expect(postUpdates().some((u) => "audio_id" in u)).toBe(false);
  });
});

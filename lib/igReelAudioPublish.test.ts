import { describe, it, expect, beforeEach } from "vitest";
import { AudioPublishError, isTrendingAudioEnabled, publishReelWithAudio, type AudioPublishDeps } from "./igReelAudioPublish";
import { _resetFbTokenCache } from "./fbToken";

const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const ENV = { FB_PAGE_ACCESS_TOKEN: "PAGE_TOKEN_X", FB_IG_USER_ID: "IGID" };

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
interface Scenario {
  audio?: Handler;
  container?: Handler;
  status?: Handler;
  publish?: Handler;
}
function mkFetch(s: Scenario) {
  const calls: Array<{ url: string; method: string; body: URLSearchParams | null }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body instanceof URLSearchParams ? init.body : null });
    if (url.includes("/ig_audio?")) return (s.audio ?? (() => j({ audio: [{ audio_id: "A1", title: "Song", display_artist: "Artist", duration_in_ms: 90000, is_ads_eligible: false }, { audio_id: "A2", duration_in_ms: 120000 }] })))(url, init);
    if (url.endsWith("/IGID/media")) return (s.container ?? (() => j({ id: "CONT1" })))(url, init);
    if (url.includes("/CONT1?")) return (s.status ?? (() => j({ status_code: "FINISHED" })))(url, init);
    if (url.endsWith("/IGID/media_publish")) return (s.publish ?? (() => j({ id: "MEDIA1" })))(url, init);
    throw new Error(`unexpected url ${url}`);
  };
  return { calls, fetchImpl };
}
const baseDeps = (f: ReturnType<typeof mkFetch>, extra: Partial<AudioPublishDeps> = {}): AudioPublishDeps => ({
  env: ENV,
  fetchImpl: f.fetchImpl,
  sleep: async () => {},
  rng: () => 0,
  ...extra,
});
const input = { videoUrl: "https://cdn/v.mp4", caption: "hello" };

beforeEach(() => _resetFbTokenCache());

describe("publishReelWithAudio — happy path", () => {
  it("creates a REELS container on graph.facebook.com/v25.0 with the exact audio_configuration, then publishes", async () => {
    const f = mkFetch({});
    const r = await publishReelWithAudio(input, baseDeps(f, { loadRecentAudioIds: async () => [], probeDurationMs: async () => 12000 }));
    expect(r.mediaId).toBe("MEDIA1");
    expect(r.audio).toMatchObject({ id: "A1", title: "Song", artist: "Artist", adsEligible: false });

    const container = f.calls.find((c) => c.url.endsWith("/IGID/media"))!;
    expect(container.url.startsWith("https://graph.facebook.com/v25.0/")).toBe(true);
    expect(container.method).toBe("POST");
    expect(container.body!.get("media_type")).toBe("REELS");
    expect(container.body!.get("video_url")).toBe("https://cdn/v.mp4");
    expect(container.body!.get("caption")).toBe("hello");
    expect(container.body!.get("share_to_feed")).toBe("true");
    expect(container.body!.get("audio_configuration")).toBe('{"audio_id":"A1","audio_volume":80,"video_volume":15}');
    expect(container.body!.get("access_token")).toBe("PAGE_TOKEN_X");
    expect(container.body!.has("is_ai_generated")).toBe(false);

    const publish = f.calls.find((c) => c.url.endsWith("/media_publish"))!;
    expect(publish.body!.get("creation_id")).toBe("CONT1");
    // never touches the Instagram-Login host
    expect(f.calls.every((c) => !c.url.includes("graph.instagram.com"))).toBe(true);
  });

  it("does not repeat a recent audio_id", async () => {
    const f = mkFetch({});
    const r = await publishReelWithAudio(input, baseDeps(f, { loadRecentAudioIds: async () => ["A1"] }));
    expect(r.audio.id).toBe("A2");
  });

  it("keeps going when the recent-ids lookup fails or the duration probe throws", async () => {
    const f = mkFetch({});
    const r = await publishReelWithAudio(input, baseDeps(f, { loadRecentAudioIds: async () => { throw new Error("column audio_id does not exist"); }, probeDurationMs: async () => { throw new Error("x"); } }));
    expect(r.audio.id).toBe("A1");
  });

  it("polls until FINISHED", async () => {
    let n = 0;
    const f = mkFetch({ status: () => j({ status_code: ++n < 3 ? "IN_PROGRESS" : "FINISHED" }) });
    const r = await publishReelWithAudio(input, baseDeps(f));
    expect(r.mediaId).toBe("MEDIA1");
    expect(n).toBe(3);
  });

  it("sends is_ai_generated only when IG_SET_AI_GENERATED=true", async () => {
    const f = mkFetch({});
    await publishReelWithAudio(input, { ...baseDeps(f), env: { ...ENV, IG_SET_AI_GENERATED: "true" } });
    expect(f.calls.find((c) => c.url.endsWith("/IGID/media"))!.body!.get("is_ai_generated")).toBe("true");
  });

  it("uses search_query (Sound Collection) when IG_AUDIO_SEARCH_QUERY is set, and honours IG_AUDIO_REQUIRE_ADS_ELIGIBLE", async () => {
    const f = mkFetch({});
    await expect(publishReelWithAudio(input, { ...baseDeps(f), env: { ...ENV, IG_AUDIO_SEARCH_QUERY: "chill", IG_AUDIO_REQUIRE_ADS_ELIGIBLE: "true" } })).rejects.toMatchObject({ stage: "no_audio" });
    expect(f.calls[0].url).toContain("search_query=chill");
  });

  it("derives the page token from FB_LONG_LIVED_USER_TOKEN", async () => {
    const f = mkFetch({});
    const inner = f.fetchImpl;
    const fetchImpl = async (u: string, i?: RequestInit) =>
      u.includes("/me/accounts") ? j({ data: [{ id: "P", access_token: "DERIVED_PAGE", instagram_business_account: { id: "IGID" } }] }) : inner(u, i);
    await publishReelWithAudio(input, { ...baseDeps(f), fetchImpl, env: { FB_LONG_LIVED_USER_TOKEN: "USER_LONG_TOKEN", FB_IG_USER_ID: "IGID" } });
    expect(f.calls.find((c) => c.url.endsWith("/IGID/media"))!.body!.get("access_token")).toBe("DERIVED_PAGE");
  });
});

describe("publishReelWithAudio — failures before anything is published (safe to fall back)", () => {
  async function stageOf(p: Promise<unknown>) {
    const e = await p.then(() => null, (x) => x as AudioPublishError);
    expect(e).toBeInstanceOf(AudioPublishError);
    return e!;
  }

  it("config: FB_IG_USER_ID missing", async () => {
    const f = mkFetch({});
    const e = await stageOf(publishReelWithAudio(input, { ...baseDeps(f), env: { FB_PAGE_ACCESS_TOKEN: "T" } }));
    expect(e.stage).toBe("config");
    expect(f.calls).toHaveLength(0);
  });

  it("token: nothing configured", async () => {
    const f = mkFetch({});
    const e = await stageOf(publishReelWithAudio(input, { ...baseDeps(f), env: { FB_IG_USER_ID: "IGID" } }));
    expect([e.stage, e.ambiguous]).toEqual(["token", false]);
    expect(f.calls).toHaveLength(0);
  });

  it("audio_list: ig_audio API error", async () => {
    const f = mkFetch({ audio: () => j({ error: { code: 10, message: "permission denied" } }, 400) });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f)));
    expect(e.stage).toBe("audio_list");
    expect(f.calls.some((c) => c.url.endsWith("/media"))).toBe(false);
  });

  it("audio_list: network error does not leak the token", async () => {
    const f = mkFetch({ audio: () => { throw new Error("fetch failed ...ig_audio?access_token=PAGE_TOKEN_X&a=1"); } });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f)));
    expect(e.stage).toBe("audio_list");
    expect(e.message).not.toContain("PAGE_TOKEN_X");
  });

  it("no_audio: every candidate was used recently", async () => {
    const f = mkFetch({});
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f, { loadRecentAudioIds: async () => ["A1", "A2"] })));
    expect(e.stage).toBe("no_audio");
  });

  it("container: API error", async () => {
    const f = mkFetch({ container: () => j({ error: { code: 2207026, message: "Unsupported video format" } }, 400) });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f)));
    expect([e.stage, e.ambiguous]).toEqual(["container", false]);
    expect(f.calls.some((c) => c.url.endsWith("/media_publish"))).toBe(false);
  });

  it("processing: status ERROR", async () => {
    const f = mkFetch({ status: () => j({ status_code: "ERROR", status: "Error: audio not available" }) });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f)));
    expect([e.stage, e.ambiguous]).toEqual(["processing", false]);
    expect(f.calls.some((c) => c.url.endsWith("/media_publish"))).toBe(false);
  });

  it("processing: never FINISHED within the budget", async () => {
    const f = mkFetch({ status: () => j({ status_code: "IN_PROGRESS" }) });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f, { pollIntervalMs: 5000, maxWaitMs: 20000 })));
    expect(e.stage).toBe("processing");
    expect(f.calls.filter((c) => c.url.includes("/CONT1?"))).toHaveLength(4);
  });

  it("publish: a clear Meta rejection (JSON error, no id) is NOT ambiguous", async () => {
    const f = mkFetch({ publish: () => j({ error: { code: 9007, message: "media not ready" } }, 400) });
    const e = await stageOf(publishReelWithAudio(input, baseDeps(f)));
    expect([e.stage, e.ambiguous]).toEqual(["publish", false]);
  });
});

describe("publishReelWithAudio — media_publish outcome unknown (must NOT fall back: double-post risk)", () => {
  it("network error during media_publish is ambiguous", async () => {
    const f = mkFetch({ publish: () => { throw new Error("socket hang up"); } });
    const e = await publishReelWithAudio(input, baseDeps(f)).catch((x) => x as AudioPublishError);
    expect(e).toMatchObject({ stage: "publish", ambiguous: true });
  });
  it("non-JSON media_publish response is ambiguous", async () => {
    const f = mkFetch({ publish: () => new Response("<html>502</html>", { status: 502 }) });
    const e = await publishReelWithAudio(input, baseDeps(f)).catch((x) => x as AudioPublishError);
    expect(e).toMatchObject({ stage: "publish", ambiguous: true });
  });
});

describe("isTrendingAudioEnabled", () => {
  it("is OFF by default (character flag false / missing)", async () => {
    expect(await isTrendingAudioEnabled(async () => false, {})).toBe(false);
  });
  it("character flag turns it on when env is unset", async () => {
    expect(await isTrendingAudioEnabled(async () => true, {})).toBe(true);
  });
  it("env false is a kill switch and does not even read the flag", async () => {
    let read = 0;
    expect(await isTrendingAudioEnabled(async () => (read++, true), { IG_TRENDING_AUDIO_ENABLED: "false" })).toBe(false);
    expect(read).toBe(0);
  });
  it("env true forces on without reading the DB", async () => {
    let read = 0;
    expect(await isTrendingAudioEnabled(async () => (read++, false), { IG_TRENDING_AUDIO_ENABLED: "true" })).toBe(true);
    expect(read).toBe(0);
  });
  it("a failing flag lookup means OFF", async () => {
    expect(await isTrendingAudioEnabled(async () => { throw new Error("db down"); }, {})).toBe(false);
  });
});

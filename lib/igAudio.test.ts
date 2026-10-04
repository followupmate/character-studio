import { describe, it, expect } from "vitest";
import { buildAudioConfiguration, fetchIgAudio, pickAudio, type IgAudioItem } from "./igAudio";

const a = (id: string, dur: number, eligible?: boolean): IgAudioItem => ({ audio_id: id, duration_in_ms: dur, title: `t${id}`, is_ads_eligible: eligible });
const first = () => 0;

describe("pickAudio", () => {
  it("skips audio ids used recently", () => {
    const p = pickAudio({ candidates: [a("1", 60000), a("2", 60000), a("3", 60000)], recentIds: ["1", "2"], rng: first });
    expect(p?.item.audio_id).toBe("3");
  });

  it("returns null when everything was used recently or the pool is empty", () => {
    expect(pickAudio({ candidates: [a("1", 60000)], recentIds: ["1"] })).toBeNull();
    expect(pickAudio({ candidates: [] })).toBeNull();
  });

  it("prefers duration >= video length", () => {
    const p = pickAudio({ candidates: [a("short", 5000), a("long", 30000)], videoDurationMs: 12000, rng: first });
    expect(p?.item.audio_id).toBe("long");
    expect(p?.tier).toBe("long_enough");
  });

  it("falls back to a shorter track when nothing is long enough", () => {
    const p = pickAudio({ candidates: [a("short", 5000)], videoDurationMs: 12000, rng: first });
    expect(p?.item.audio_id).toBe("short");
    expect(p?.tier).toBe("any");
  });

  it("ignores duration when the video length is unknown", () => {
    const p = pickAudio({ candidates: [a("short", 5000)], videoDurationMs: null, rng: first });
    expect(p?.item.audio_id).toBe("short");
    expect(p?.tier).toBe("long_enough");
  });

  it("prefers ads-eligible + long enough over plain long enough", () => {
    const p = pickAudio({ candidates: [a("trend", 90000, false), a("safe", 90000, true)], videoDurationMs: 10000, rng: first });
    expect(p?.item.audio_id).toBe("safe");
    expect(p?.tier).toBe("eligible_long_enough");
  });

  it("requireAdsEligible is a hard filter", () => {
    expect(pickAudio({ candidates: [a("trend", 90000, false)], requireAdsEligible: true })).toBeNull();
    expect(pickAudio({ candidates: [a("trend", 90000, false), a("safe", 1000, true)], requireAdsEligible: true, videoDurationMs: 10000 })?.item.audio_id).toBe("safe");
  });

  it("keeps trending order but varies inside the top N via rng; dedupes ids", () => {
    const c = [a("1", 60000), a("2", 60000), a("2", 60000), a("3", 60000)];
    expect(pickAudio({ candidates: c, rng: first })?.item.audio_id).toBe("1");
    expect(pickAudio({ candidates: c, rng: () => 0.99 })?.item.audio_id).toBe("3");
    expect(pickAudio({ candidates: c, rng: () => 0.99, topN: 1 })?.item.audio_id).toBe("1");
  });
});

describe("buildAudioConfiguration", () => {
  it("produces the documented JSON shape with 80/15", () => {
    const s = buildAudioConfiguration("1234567890");
    expect(s).toBe('{"audio_id":"1234567890","audio_volume":80,"video_volume":15}');
    expect(JSON.parse(s)).toEqual({ audio_id: "1234567890", audio_volume: 80, video_volume: 15 });
  });
  it("clamps volumes to 1..100", () => {
    expect(JSON.parse(buildAudioConfiguration("x", 500, 0))).toEqual({ audio_id: "x", audio_volume: 100, video_volume: 1 });
  });
});

describe("fetchIgAudio", () => {
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

  it("reads the `audio` key, follows cursor paging and uses ig_user_id", async () => {
    const urls: string[] = [];
    const fetchImpl = async (u: string) => {
      urls.push(u);
      return u.includes("after=C1") ? json({ audio: [{ audio_id: "3" }], paging: { cursors: { after: "C2" } } }) : json({ audio: [{ audio_id: "1" }, { audio_id: "2" }], paging: { cursors: { after: "C1" } } });
    };
    const items = await fetchIgAudio({ igUserId: "IG", token: "T", fetchImpl, maxPages: 2 });
    expect(items.map((i) => i.audio_id)).toEqual(["1", "2", "3"]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("https://graph.facebook.com/v25.0/ig_audio?");
    expect(urls[0]).toContain("ig_user_id=IG");
    expect(urls[0]).toContain("audio_type=music");
    expect(urls[1]).toContain("after=C1");
  });

  it("also accepts `data`, passes search_query, drops items without id", async () => {
    let url = "";
    const fetchImpl = async (u: string) => ((url = u), json({ data: [{ audio_id: "9", download_url: "x" }, { title: "no id" }] }));
    const items = await fetchIgAudio({ igUserId: "IG", token: "T", searchQuery: "chill", fetchImpl });
    expect(items.map((i) => i.audio_id)).toEqual(["9"]);
    expect(url).toContain("search_query=chill");
  });

  it("throws a redacted error on an API error", async () => {
    const fetchImpl = async () => json({ error: { code: 190, message: "Invalid OAuth access token access_token=EAAB1234567890abcdefghijkl" } });
    const err = (await fetchIgAudio({ igUserId: "IG", token: "T", fetchImpl }).catch((e) => e)) as Error;
    expect(err.message).toContain("190");
    expect(err.message).not.toContain("EAAB1234567890");
  });
});

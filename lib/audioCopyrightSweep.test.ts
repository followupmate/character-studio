import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseCopyrightInfo, runAudioCopyrightSweep, type SweepCandidate, type SweepDeps } from "./audioCopyrightSweep";
import { _resetFbTokenCache } from "./fbToken";

const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const ENV = { FB_PAGE_ACCESS_TOKEN: "PAGE_TOKEN_X" };
const NOW = new Date("2026-10-12T12:00:00Z");
const MUTED = {
  copyright_check_information: {
    status: { status: "completed", matches_found: true },
    copyright_matches: [{ author: "Label", content_title: "Hit", matched_segments: [{ segment_type: "AUDIO", start_time_in_seconds: 0, duration_in_seconds: 10 }], owner_copyright_policy: { name: "p", actions: [{ action: "MUTE", geos: ["US", "DE"] }] } }],
  },
};
const CLEAN = { copyright_check_information: { status: { status: "completed", matches_found: false } } };

const cand = (id: string, mode: string, extra: Partial<SweepCandidate> = {}, meta: Record<string, unknown> = {}): SweepCandidate => ({
  id, character_id: "c1", platform_post_id: `M_${id}`, posted_at: "2026-10-12T08:00:00Z", audio_meta: { mode, ...meta }, ...extra,
});

function mk(cands: SweepCandidate[], resp: (url: string) => Response) {
  const saved: Array<[string, Record<string, unknown>]> = [];
  const locks: Array<[string, { postId: string; reason: string }]> = [];
  const urls: string[] = [];
  const deps: SweepDeps = {
    env: ENV,
    now: NOW,
    fetchImpl: async (u) => (urls.push(u), resp(u)),
    loadCandidates: async () => cands,
    saveResult: async (id, p) => void saved.push([id, p]),
    lockTrending: async (c, i) => void locks.push([c, i]),
  };
  return { deps, saved, locks, urls };
}

beforeEach(() => {
  _resetFbTokenCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parseCopyrightInfo", () => {
  it("parses status, matches, MUTE actions and AUDIO segments", () => {
    expect(parseCopyrightInfo(MUTED)).toEqual({ status: "completed", matchesFound: true, actions: [{ action: "MUTE", geos: 2 }], audioSegments: 1, restricted: true });
    expect(parseCopyrightInfo(CLEAN)).toMatchObject({ matchesFound: false, restricted: false });
    expect(parseCopyrightInfo({ copyright_check_information: { status: { status: "in_progress" } } })).toMatchObject({ status: "in_progress", matchesFound: null, restricted: false });
    expect(parseCopyrightInfo({ id: "x" })).toBeNull();
    expect(parseCopyrightInfo(null)).toBeNull();
  });
});

describe("runAudioCopyrightSweep", () => {
  it("muted TRENDING reel -> stored + character locked to library", async () => {
    const m = mk([cand("p1", "trending")], () => j(MUTED));
    const r = await runAudioCopyrightSweep(m.deps);
    expect(m.urls[0]).toContain("/M_p1?fields=copyright_check_information");
    expect(r).toMatchObject({ checked: 1, restricted: ["p1"], locked: ["c1"] });
    expect(m.locks[0]).toEqual(["c1", { postId: "p1", reason: "copyright MUTE" }]);
    expect(m.saved[0][1].copyright).toMatchObject({ status: "completed", matches_found: true, restricted: true, final: true });
  });

  it("muted LIBRARY reel is recorded but does not lock", async () => {
    const m = mk([cand("p1", "library")], () => j(MUTED));
    const r = await runAudioCopyrightSweep(m.deps);
    expect(r.restricted).toEqual(["p1"]);
    expect(m.locks).toHaveLength(0);
  });

  it("clean / in-progress -> no lock; in_progress is not final while young", async () => {
    const m = mk([cand("p1", "trending")], () => j({ copyright_check_information: { status: { status: "in_progress", matches_found: false } } }));
    await runAudioCopyrightSweep(m.deps);
    expect(m.locks).toHaveLength(0);
    expect(m.saved[0][1].copyright).toMatchObject({ status: "in_progress", final: false });
  });

  it("field unsupported -> recorded as unavailable; final after 48 h", async () => {
    const m = mk([cand("p1", "trending", { posted_at: "2026-10-10T08:00:00Z" })], () => j({ id: "M_p1" }));
    await runAudioCopyrightSweep(m.deps);
    expect(m.saved[0][1].copyright).toMatchObject({ status: "unavailable", final: true });
  });

  it("skips posts without audio, final ones and ones checked < 30 min ago; max 3 per tick, trending first", async () => {
    const m = mk(
      [
        cand("none", "none"),
        cand("fin", "trending", {}, { copyright: { final: true } }),
        cand("fresh", "trending", {}, { copyright: { checked_at: "2026-10-12T11:45:00Z" } }),
        cand("l1", "library"),
        cand("l2", "library"),
        cand("t1", "trending"),
        cand("t2", "trending", {}, { copyright: { checked_at: "2026-10-12T11:00:00Z" } }),
      ],
      () => j(CLEAN)
    );
    const r = await runAudioCopyrightSweep(m.deps);
    expect(r.checked).toBe(3);
    expect(m.saved.map((s) => s[0])).toEqual(["t1", "t2", "l1"]);
  });

  it("nothing due -> no Graph call", async () => {
    const m = mk([cand("none", "none")], () => j(CLEAN));
    expect(await runAudioCopyrightSweep(m.deps)).toMatchObject({ skipped: "nothing due" });
    expect(m.urls).toHaveLength(0);
  });

  it("no token -> skipped; Graph errors are collected and the token never leaks", async () => {
    const m = mk([cand("p1", "trending")], () => j(CLEAN));
    expect((await runAudioCopyrightSweep({ ...m.deps, env: {} })).skipped).toBe("no FB page token");
    _resetFbTokenCache();
    const m2 = mk([cand("p1", "trending")], () => j({ error: { code: 100, message: "bad access_token=PAGE_TOKEN_X" } }, 400));
    const r = await runAudioCopyrightSweep(m2.deps);
    expect(r.errors).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain("PAGE_TOKEN_X");
    expect(m2.locks).toHaveLength(0);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Route-level behaviour of /api/characters/video-async after Phase 2: hook overlay gating, the
// raw/overlay URL split, the two failure policies, and the recipe negative prompt on submit.

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  media: {} as Row,
  plan: { character_id: "c1" } as Row | null,
  character: { feature_flags: {} } as Row | null,
  updates: [] as Row[],
  uploads: [] as string[],
  submitted: [] as Array<{ model: string; input: Record<string, unknown> }>,
  overlayOutcome: null as unknown,
  overlayCalls: [] as Array<{ hookText: string }>,
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const q: { op: string; payload: Row | null; filters: Row } = { op: "select", payload: null, filters: {} };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => ((q.filters[k] = v), builder),
      update: (p: Row) => ((q.op = "update"), (q.payload = p), builder),
      single: async () => ({ data: table === "chs_media" ? (q.filters.slot ? { media_url: "https://sf/start.png" } : state.media) : null, error: null }),
      maybeSingle: async () => ({ data: table === "chs_daily_plans" ? state.plan : table === "chs_characters" ? state.character : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (q.op === "update" && table === "chs_media") state.updates.push(q.payload as Row);
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return {
    supabase: {
      from,
      storage: {
        from: () => ({
          upload: async (p: string) => (state.uploads.push(p), { error: null }),
          getPublicUrl: (p: string) => ({ data: { publicUrl: `https://store/${p}` } }),
        }),
      },
    },
  };
});

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: () => undefined,
    queue: {
      status: async () => ({ status: "COMPLETED" }),
      result: async () => ({ data: { video: { url: "https://fal/v.mp4" } } }),
      submit: async (model: string, { input }: { input: Record<string, unknown> }) => (state.submitted.push({ model, input }), { request_id: "req1" }),
    },
  },
}));

vi.mock("@/lib/dailyBatch", () => ({ recomputeBatchStatus: async () => "ready" }));

vi.mock("@/lib/video/hookOverlayPipeline", async (orig) => {
  const real = await orig<typeof import("@/lib/video/hookOverlayPipeline")>();
  return {
    ...real,
    applyHookOverlayToBuffer: async (o: { hookText: string }) => (state.overlayCalls.push({ hookText: o.hookText }), state.overlayOutcome),
  };
});

import { POST } from "@/app/api/characters/video-async/route";

const MARKER = { id: "ootd_stop", hook_text: "how’s the fit", negative_prompt: "no cuts, no text", target_duration_sec: 8 };
const JOB = JSON.stringify({ falq: true, model: "fal-ai/kling-video/v3/pro/image-to-video", requestId: "req1", phase: "video", audioStyle: "silent", needsAudio: false });

function req(body: Record<string, unknown> = { mediaId: "m1", audioStyle: "silent" }) {
  return new Request("http://x/api/characters/video-async", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  process.env.FAL_API_KEY = "k";
  delete process.env.HOOK_OVERLAY_ENABLED;
  state.media = { id: "m1", slot: "reel_video", batch_id: "b1", higgsfield_prompt: "p", higgsfield_job_id: JOB, media_url: null, visual_signature: { reel_recipe: MARKER } };
  state.plan = { character_id: "c1" };
  state.character = { feature_flags: { hook_overlay_v1: true } };
  state.updates = [];
  state.uploads = [];
  state.submitted = [];
  state.overlayCalls = [];
  state.overlayOutcome = { kind: "applied", video: Buffer.from("overlay"), cover: Buffer.from("jpg"), hookText: "how’s the fit", ms: 5 };
  vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("rawvideo").buffer }));
});

describe("video-async final step", () => {
  it("overlay OFF (flag absent): single upload, media_url === source_url, overlay never called", async () => {
    state.character = { feature_flags: {} };
    const res = await (await POST(req())).json();
    expect(res.status).toBe("ready");
    expect(state.overlayCalls).toHaveLength(0);
    expect(state.uploads).toEqual(["videos/m1.mp4"]);
    const u = state.updates.at(-1)!;
    expect(u.media_url).toBe(u.source_url);
    expect(u.status).toBe("ready");
  });

  it("overlay ON via character flag: raw -> source_url, overlay -> media_url, cover -> thumbnail_url", async () => {
    const res = await (await POST(req())).json();
    expect(res).toMatchObject({ status: "ready", overlay: "applied" });
    expect(state.overlayCalls).toEqual([{ hookText: "how’s the fit" }]);
    expect(state.uploads).toEqual(["videos/m1-raw.mp4", "videos/m1.mp4", "videos/m1-cover.jpg"]);
    const u = state.updates.at(-1)!;
    expect(String(u.source_url)).toContain("videos/m1-raw.mp4");
    expect(String(u.media_url)).toContain("videos/m1.mp4");
    expect(String(u.thumbnail_url)).toContain("m1-cover.jpg");
    expect((u.visual_signature as { reel_recipe: { overlay_status: string } }).reel_recipe.overlay_status).toBe("applied");
  });

  it("HOOK_OVERLAY_ENABLED=false is a kill switch even with the flag on", async () => {
    process.env.HOOK_OVERLAY_ENABLED = "false";
    await POST(req());
    expect(state.overlayCalls).toHaveLength(0);
  });

  it("HOOK_OVERLAY_ENABLED=true enables without the character flag", async () => {
    process.env.HOOK_OVERLAY_ENABLED = "true";
    state.character = { feature_flags: {} };
    await POST(req());
    expect(state.overlayCalls).toHaveLength(1);
  });

  it("no recipe marker -> no overlay, ever (hook text never comes from anywhere else)", async () => {
    process.env.HOOK_OVERLAY_ENABLED = "true";
    state.media = { ...state.media, visual_signature: { prompt_director: {} } };
    await POST(req());
    expect(state.overlayCalls).toHaveLength(0);
    expect(state.uploads).toEqual(["videos/m1.mp4"]);
  });

  it("render failure -> publishes the RAW video without overlay (ready), error recorded in the marker", async () => {
    state.overlayOutcome = { kind: "render_failed", error: "ffmpeg exit 1" };
    const res = await (await POST(req())).json();
    expect(res).toMatchObject({ status: "ready", overlay: "render_failed" });
    const u = state.updates.at(-1)!;
    expect(u.status).toBe("ready");
    expect(u.media_url).toBe(u.source_url);
    expect((u.visual_signature as { reel_recipe: { overlay_status: string; overlay_detail: string } }).reel_recipe).toMatchObject({
      overlay_status: "render_failed",
      overlay_detail: "ffmpeg exit 1",
    });
  });

  it("invalid hook text -> needs_review: raw kept in source_url, media_url NULL, not retried, HTTP 422", async () => {
    state.overlayOutcome = { kind: "needs_review", hookText: "how’s the fit", issues: [{ code: "misspelled", detail: "fit" }] };
    const r = await POST(req());
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/needs_review/);
    const u = state.updates.at(-1)!;
    expect(u.media_url).toBeNull();
    expect(String(u.source_url)).toContain("videos/m1-raw.mp4");
    expect(u.generation_status).toBe("failed");
    expect(u.retry_count).toBe(3); // reconcileFailedSlots (< 3) and auto-media must not re-buy the video
    expect(u.status).toBe("pending");
    expect(String(u.last_error)).toMatch(/^needs_review:/);
  });

  it("flag lookup failure never blocks publishing: overlay off, raw published", async () => {
    state.plan = null;
    await POST(req());
    expect(state.overlayCalls).toHaveLength(0);
    expect(state.updates.at(-1)!.status).toBe("ready");
  });
});

describe("video-async submit (kling)", () => {
  it("recipe reel: sends the recipe negative_prompt and 8 s duration", async () => {
    state.media = { ...state.media, higgsfield_job_id: null };
    await POST(req({ mediaId: "m1", model: "kling", audioStyle: "silent" }));
    const { input, model } = state.submitted[0];
    expect(model).toBe("fal-ai/kling-video/v3/pro/image-to-video");
    expect(input.negative_prompt).toBe("no cuts, no text");
    expect(input.duration).toBe("8");
  });

  it("non-recipe reel: unchanged (duration 10, no negative_prompt)", async () => {
    state.media = { ...state.media, higgsfield_job_id: null, visual_signature: null };
    await POST(req({ mediaId: "m1", model: "kling", audioStyle: "silent" }));
    const { input } = state.submitted[0];
    expect(input.duration).toBe("10");
    expect("negative_prompt" in input).toBe(false);
  });
});

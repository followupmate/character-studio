import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Phase 6: post-now re-grounds an IG reel caption against the final start-frame prompt right before
// publishing (the start frame can be regenerated after from-batch queued the post).

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  post: {} as Row,
  reelMedia: null as Row | null,
  startFrame: null as Row | null,
}));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const f: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => ((f[k] = v), builder),
      not: () => builder,
      gte: () => builder,
      update: () => builder,
      single: async () => ({ data: state.post, error: null }),
      maybeSingle: async () => {
        if (table === "chs_media") return { data: f.slot === "reel_start_frame" ? state.startFrame : state.reelMedia, error: null };
        return { data: table === "chs_characters" ? { feature_flags: {} } : null, error: null };
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return builder;
  }
  return { supabase: { from } };
});
vi.mock("@/lib/igToken", () => ({ getIgAccessToken: async () => "IG_LOGIN_TOKEN" }));
vi.mock("@/lib/recovery/videoDuration", () => ({ probeVideoDuration: async () => ({ durationSec: 12 }) }));

import { POST } from "@/app/api/publish/post-now/route";
import { pickReelShareLine } from "@/lib/captionTemplate";

let containerBody = "";
const j = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const SAVED = { ...process.env };

beforeEach(() => {
  state.post = {
    id: "p1", platform: "instagram", character_id: "c1", media_id: "rv1", scheduled_at: "2026-10-08T15:30:00Z",
    ig_caption: `kitchen light, slow start. the cat is supervising.\n${pickReelShareLine("2026-10-08")}`,
    hashtags: ["slowmorning"], chs_media: { type: "video", media_url: "https://cdn/v.mp4" },
  };
  state.reelMedia = { id: "rv1", batch_id: "plan1", higgsfield_prompt: "the cat jumps onto the counter" };
  state.startFrame = { higgsfield_prompt: "Tight head-and-shoulders close-up portrait in her kitchen, soft morning light." };
  containerBody = "";
  process.env = { ...SAVED, IG_USER_ID: "LEGACYIG" };
  delete process.env.IG_TRENDING_AUDIO_ENABLED;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => (fn(), 0)) as unknown as typeof setTimeout);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (url.endsWith("/LEGACYIG/media")) {
      containerBody = String(init?.body ?? "");
      return j({ id: "LC" });
    }
    if (url.includes("/LC?")) return j({ status_code: "FINISHED" });
    if (url.endsWith("/LEGACYIG/media_publish")) return j({ id: "LEGACY_MEDIA" });
    throw new Error(`unexpected fetch ${url}`);
  });
});
afterEach(() => {
  process.env = SAVED;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sentCaption = () => {
  const b = containerBody;
  try {
    return String(JSON.parse(b).caption);
  } catch {
    return new URLSearchParams(b).get("caption") ?? b;
  }
};

describe("post-now reel caption grounding (phase 6)", () => {
  it("drops the cat sentence when the final start frame has no cat; share line + hashtags kept", async () => {
    const body = await (await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ post_id: "p1" }) }))).json();
    expect(body.success).toBe(true);
    expect(sentCaption()).toBe(`kitchen light, slow start.\n${pickReelShareLine("2026-10-08")}\n\n#slowmorning`);
  });

  it("no grounding text available -> caption unchanged", async () => {
    state.reelMedia = null;
    await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ post_id: "p1" }) }));
    expect(sentCaption()).toMatch(/the cat is supervising\./);
  });
});

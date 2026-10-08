import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Phase 6: from-batch grounds the IG reel caption (and the YT description) against the FINAL
// reel_start_frame prompt; with no prompt available it behaves exactly like phase 5.

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ inserts: [] as Row[], storyCaption: "" as string, startFramePrompt: null as string | null, platforms: ["instagram"] as string[] }));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const q: { op: string; payload: Row | null } = { op: "select", payload: null };
    const data = (): unknown => {
      switch (table) {
        case "chs_characters":
          return [{ id: "c1", name: "Vivienne", posting_time: "10:00", platforms: state.platforms, fanvue_link: null }];
        case "chs_story_days":
          return { id: "sd1", character_id: "c1", date: "2026-10-08", day_number: 130, ig_caption: state.storyCaption, hashtags: ["morningathome", "slowmorning"] };
        case "chs_daily_plans":
          return { id: "plan1", character_id: "c1", story_day_id: "sd1" };
        case "chs_media":
          return [
            { id: "sf", slot: "reel_start_frame", sequence_index: 0, media_url: "https://x/sf.png", generation_status: "completed", higgsfield_prompt: state.startFramePrompt },
            { id: "rv", slot: "reel_video", sequence_index: 0, media_url: "https://x/r.mp4", generation_status: "completed", higgsfield_prompt: "she turns toward the lens; the cat jumps onto the counter" },
          ];
        case "chs_posts":
          return [];
        default:
          return null;
      }
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (p: Row) => ((q.op = "insert"), (q.payload = p), state.inserts.push(p), builder),
      maybeSingle: async () => ({ data: data(), error: null }),
      single: async () => ({ data: q.op === "insert" ? { id: `post-${state.inserts.length}` } : data(), error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: data(), error: null }),
    };
    return builder;
  }
  return { supabase: { from } };
});

import { GET } from "@/app/api/publish/from-batch/route";
import { pickReelShareLine } from "@/lib/captionTemplate";

const OVERRIDE_PROMPT_1008 = "Tight head-and-shoulders close-up portrait, cropped just below the collarbones. Her face fills the upper half of the vertical frame; waist, hips and legs are out of frame. Camera level at her eye height, about 60 cm from her face, 85mm lens look, upright and correctly oriented, horizon level.\n\nOne woman alone in her El Born galley kitchen in Barcelona, white marble worktop and sage-green cabinets blurred into soft bokeh behind her. White satin slip dress with thin straps on both shoulders, a thin delicate gold chain at her collarbone.\n\nMid get-ready: one hand raised, fingertips tucking a strand of dark wavy hair behind her ear, head turned slightly toward a mirror just off camera, eyes beginning to turn back toward the lens, lips softly parted, quiet almost-smile.\n\nSoft warm diffused morning light from a linen-curtained window to her left, gentle golden glow on her cheek and hair, soft shadows, shallow depth of field.\n\nA single natural photograph. One woman, one body position, one instant. Full-bleed 9:16. Natural skin texture with visible pores, true-to-life exposure.";
const SAVED = { ...process.env };
beforeEach(() => {
  state.inserts = [];
  state.platforms = ["instagram"];
  process.env = { ...SAVED, CRON_SECRET: "test-secret" };
});
afterEach(() => {
  process.env = SAVED;
});
const run = () => GET(new Request("http://x/api/publish/from-batch?date=2026-10-08", { headers: { authorization: "Bearer test-secret" } }));

describe("from-batch reel caption grounding (phase 6)", () => {
  it("2026-10-08: cat / strap-off / egg dropped against the close-up start frame (motion prompt's cat ignored)", async () => {
    state.storyCaption = "the cat is supervising. one strap is already off. the egg is probably fine.";
    state.startFramePrompt = OVERRIDE_PROMPT_1008;
    const body = await (await run()).json();
    const reel = state.inserts.find((p) => p.post_type === "reel" && p.platform === "instagram")!;
    expect(reel.ig_caption).toBe(pickReelShareLine("2026-10-08"));
    expect(JSON.stringify(body)).toMatch(/reel caption: dropped 3 ungrounded sentence\(s\) \(cat, strap_off, egg\)/);
  });

  it("keeps grounded sentences and drops only the ungrounded one", async () => {
    state.storyCaption = "mid get-ready in the kitchen light. the cat is supervising.";
    state.startFramePrompt = OVERRIDE_PROMPT_1008;
    await run();
    const reel = state.inserts.find((p) => p.post_type === "reel")!;
    expect(reel.ig_caption).toBe(`mid get-ready in the kitchen light.\n${pickReelShareLine("2026-10-08")}`);
  });

  it("YouTube description is grounded too", async () => {
    state.platforms = ["instagram", "youtube"];
    state.storyCaption = "mid get-ready in the kitchen light. the egg is probably fine.";
    state.startFramePrompt = OVERRIDE_PROMPT_1008;
    await run();
    const yt = state.inserts.find((p) => p.post_type === "reel" && p.platform === "youtube")!;
    expect(String(yt.yt_description)).not.toMatch(/egg/);
    expect(String(yt.yt_description)).toMatch(/^mid get-ready in the kitchen light\./);
  });

  it("no start-frame prompt -> falls back to the reel_video prompt (which shows the cat) -> caption kept", async () => {
    state.storyCaption = "the cat is supervising.";
    state.startFramePrompt = null;
    await run();
    const reel = state.inserts.find((p) => p.post_type === "reel")!;
    expect(reel.ig_caption).toBe(`the cat is supervising.\n${pickReelShareLine("2026-10-08")}`);
  });
});

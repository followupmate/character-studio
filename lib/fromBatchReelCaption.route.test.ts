import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Phase 5: /api/publish/from-batch writes the IG REEL caption with exactly one share line at the end
// (follow-CTA replaced); the carousel keeps the old caption policy (appendSendLine, unchanged).

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ inserts: [] as Row[], storyCaption: "" as string }));

vi.mock("@/lib/supabase", () => {
  function from(table: string) {
    const q: { op: string; payload: Row | null } = { op: "select", payload: null };
    const data = (): unknown => {
      switch (table) {
        case "chs_characters":
          return [{ id: "c1", name: "Vivienne", posting_time: "10:00", platforms: ["instagram"], fanvue_link: null }];
        case "chs_story_days":
          return { id: "sd1", character_id: "c1", date: "2026-10-07", day_number: 87, ig_caption: state.storyCaption, hashtags: ["ootd", "fyp", "olivetrees"] };
        case "chs_daily_plans":
          return { id: "plan1", character_id: "c1", story_day_id: "sd1" };
        case "chs_media":
          return [
            { id: "m1", slot: "carousel_1", sequence_index: 1, media_url: "https://x/1.jpg", generation_status: "completed" },
            { id: "m2", slot: "carousel_2", sequence_index: 2, media_url: "https://x/2.jpg", generation_status: "completed" },
            { id: "m3", slot: "reel_video", sequence_index: 0, media_url: "https://x/r.mp4", generation_status: "completed" },
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
import { REEL_SHARE_LINES, pickReelShareLine } from "@/lib/captionTemplate";

const SAVED = { ...process.env };
beforeEach(() => {
  state.inserts = [];
  process.env = { ...SAVED, CRON_SECRET: "test-secret" };
});
afterEach(() => {
  process.env = SAVED;
});

const run = () => GET(new Request("http://x/api/publish/from-batch?date=2026-10-07", { headers: { authorization: "Bearer test-secret" } }));

describe("from-batch reel caption (phase 5)", () => {
  it("reel ends with the day's share line, follow-CTA removed; carousel unchanged", async () => {
    state.storyCaption = "terrace, coffee, the fit for the day.\nhere most days if this is your kind of quiet.";
    const res = await run();
    expect(res.status).toBe(200);
    const reel = state.inserts.find((p) => p.post_type === "reel")!;
    const carousel = state.inserts.find((p) => p.post_type === "carousel")!;
    expect(reel.ig_caption).toBe(`terrace, coffee, the fit for the day.\n${pickReelShareLine("2026-10-07")}`);
    expect(carousel.ig_caption).toBe(state.storyCaption); // invite already present -> appendSendLine no-op, as before
    expect(reel.hashtags).toEqual(["ootd", "olivetrees"]);
  });

  it("reel gets a share line even when the story caption has no CTA", async () => {
    state.storyCaption = "one take, no cuts.";
    await run();
    const reel = state.inserts.find((p) => p.post_type === "reel")!;
    const last = String(reel.ig_caption).split("\n").pop()!;
    expect(REEL_SHARE_LINES).toContain(last);
  });
});

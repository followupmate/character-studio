import { NextResponse } from "next/server";
import { requireCron } from "@/lib/apiAuth";
import { supabase } from "@/lib/supabase";
import { recomputeBatchStatus } from "@/lib/dailyBatch";

export const runtime = "nodejs";
export const maxDuration = 300;

// ROOT-CAUSE FIX — nothing generated MEDIA automatically. The 06:00 story cron (generateDailyBatch)
// only writes slot PROMPTS; media_url stayed null until an operator clicked through /today, and a
// day nobody repaired (2026-09-26) never reached from-batch (which requires media_url).
//
// This tick advances today's batch by exactly ONE slot per invocation, each slot in its own
// function invocation (generate-media / video-async), so no single invocation ever has to fit a
// full set into the 300s limit:
//   1. photo slots (reel_start_frame first) -> generate-media with model "higgsfield-soul"
//      (explicit Soul, identity-locked; never the Google-first "auto" chain). Re-calls are free:
//      generate-media resumes the queued Soul job stored in higgsfield_job_id.
//   2. reel_video -> video-async model "kling" once reel_start_frame has a URL; later ticks poll
//      the stored fal job until the video lands.
// Failed rows without a resumable job are NOT resubmitted (no paying repeatedly for a broken
// slot) — they stay visible for the operator. Schedule via cron-job.org every 5 min for ~2h
// after the story cron (?secret=CRON_SECRET), same as /api/publish/cron.

const PHOTO_ORDER = ["reel_start_frame", "story_bts"];

type Row = {
  id: string;
  slot: string;
  type: string;
  media_url: string | null;
  generation_status: string | null;
  higgsfield_prompt: string | null;
  higgsfield_job_id: string | null;
};

function hasPrompt(m: Row): boolean {
  return !!m.higgsfield_prompt && m.higgsfield_prompt.trim().length > 0;
}

// Eligible = prompt ready and never started, or a job is already in flight that we can resume/poll.
function eligible(m: Row): boolean {
  if (m.media_url || !hasPrompt(m)) return false;
  if (m.generation_status === "completed") return true;
  return !!m.higgsfield_job_id;
}

export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  const origin = req.headers.get("x-forwarded-host")
    ? `https://${req.headers.get("x-forwarded-host")}`
    : process.env.APP_URL ?? "http://localhost:3000";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` };

  async function call(path: string, body: Record<string, unknown>, timeoutMs: number) {
    try {
      const res = await fetch(`${origin}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      // A timeout here only means THIS tick stopped waiting; the child invocation keeps running
      // and persists its own result (or its resumable job id) for the next tick.
      return { status: 0, body: { note: String(err).slice(0, 200) } };
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: plans } = await supabase.from("chs_daily_plans").select("id").eq("date", today);

  for (const plan of plans ?? []) {
    const { data } = await supabase
      .from("chs_media")
      .select("id, slot, type, media_url, generation_status, higgsfield_prompt, higgsfield_job_id")
      .eq("batch_id", plan.id);
    const rows = (data ?? []) as Row[];

    const photo = rows
      .filter((m) => m.type === "photo" && eligible(m))
      .sort((a, b) => {
        const ai = PHOTO_ORDER.indexOf(a.slot);
        const bi = PHOTO_ORDER.indexOf(b.slot);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      })[0];
    if (photo) {
      const r = await call("/api/characters/generate-media", { mediaId: photo.id, model: "higgsfield-soul" }, 285_000);
      return NextResponse.json({ batchId: plan.id, slot: photo.slot, action: "soul", result: r });
    }

    const video = rows.find((m) => m.slot === "reel_video" && eligible(m));
    const startFrame = rows.find((m) => m.slot === "reel_start_frame");
    if (video && startFrame?.media_url) {
      const r = await call("/api/characters/video-async", { mediaId: video.id, model: "kling" }, 55_000);
      return NextResponse.json({ batchId: plan.id, slot: "reel_video", action: "kling", result: r });
    }

    await recomputeBatchStatus(plan.id);
  }

  return NextResponse.json({ message: "Nothing to advance" });
}

export async function POST(req: Request) {
  return GET(req);
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { compileRecoveryDays } from "@/lib/recovery/recoveryDays";
import { compileRecoveryStartFrame, START_FRAME_FRAMING_NEGATIVES } from "@/lib/recovery/simpleReelCompiler";

export const runtime = "nodejs";
export const maxDuration = 60;

// RECOVERY — seed the DB rows for ONE approved recovery reel.
//
// Prepares only. It writes a daily plan and two media rows carrying the already-compiled prompts;
// it never calls a provider and never publishes. Generation is a separate, explicit call to
// /api/characters/generate-media with the returned media ids.
//
// Idempotent: re-running for the same slot reuses the existing plan and rewrites the prompts, so a
// prompt fix does not leave a second orphaned batch behind.
//
// TWO DELIBERATE CHOICES, both visible rather than hidden:
//
// 1. story_day_id stays NULL. A recovery reel is not a story day — inventing one would push a
//    synthetic day_number into the arc planner and the tier history. The column is nullable and
//    every consumer already treats a missing story day as "no narrative context".
//
// 2. The plan IS a real chs_daily_plans row, dated inside the review window, because that is what
//    makes the first-frame QA gate and the duration gate apply to it. The one side effect worth
//    naming: lib/dailyBatch.ts reads the 7 most recent plans for wardrobe/prop rotation, so this
//    outfit will count as recently worn for future scene briefs. That is correct — it is a real
//    published look — but it is a side effect, not a no-op.
const RECOVERY_PLAN_START_DATE = "2026-09-08"; // first date with no existing plan (checked 2026-09-04)

function planDateForSlot(slot: number): string {
  const d = new Date(`${RECOVERY_PLAN_START_DATE}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + (slot - 1));
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { slot?: number; characterId?: string };
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
    return NextResponse.json({ error: "slot must be 1..5" }, { status: 400 });
  }

  const day = compileRecoveryDays().find((d) => d.slot === slot);
  if (!day) return NextResponse.json({ error: `no recovery day ${slot}` }, { status: 404 });

  // A brief that cannot compile clean must never reach a provider. compileRecoveryDays() already
  // throws on errors; this is the belt-and-braces check for warnings too.
  if (day.compiled.validation.errors.length > 0 || day.compiled.validation.warnings.length > 0) {
    return NextResponse.json(
      {
        error: "recovery brief did not validate clean",
        errors: day.compiled.validation.errors,
        warnings: day.compiled.validation.warnings,
      },
      { status: 422 }
    );
  }

  let characterId = body.characterId;
  if (!characterId) {
    const { data: chars } = await supabase.from("chs_characters").select("id").eq("is_active", true).limit(2);
    if (!chars || chars.length !== 1) {
      return NextResponse.json({ error: "pass characterId — could not resolve a single active character" }, { status: 400 });
    }
    characterId = chars[0].id as string;
  }

  const date = planDateForSlot(slot);
  const marker = {
    recovery: {
      slot,
      direction: day.direction,
      objective: day.objective,
      target_duration_sec: day.compiled.durationSec,
      compiler: "simpleReelCompiler",
      prepared_at: new Date().toISOString(),
    },
  };

  // ── plan ────────────────────────────────────────────────────────────────
  const { data: existingPlan } = await supabase
    .from("chs_daily_plans")
    .select("id, content_mix")
    .eq("character_id", characterId)
    .eq("date", date)
    .maybeSingle();

  const existingRecoverySlot = (existingPlan?.content_mix as { recovery?: { slot?: number } } | null)?.recovery?.slot;
  if (existingPlan && existingRecoverySlot !== slot) {
    return NextResponse.json(
      { error: `a non-recovery plan already occupies ${date} — refusing to overwrite it` },
      { status: 409 }
    );
  }

  const planFields = {
    character_id: characterId,
    date,
    story_day_id: null,
    scene_brief: day.brief as unknown as Record<string, unknown>,
    scene_brief_doctrine: `RECOVERY reel ${slot} — ${day.direction}. ${day.objective}`,
    batch_status: "ready",
    content_mix: marker,
  };

  let batchId: string;
  if (existingPlan) {
    const { error } = await supabase.from("chs_daily_plans").update(planFields).eq("id", existingPlan.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    batchId = existingPlan.id as string;
  } else {
    const { data, error } = await supabase.from("chs_daily_plans").insert(planFields).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "plan insert failed" }, { status: 500 });
    batchId = data.id as string;
  }

  // ── media ───────────────────────────────────────────────────────────────
  const startFramePrompt = compileRecoveryStartFrame({
    sceneBrief: day.brief,
    framing: day.compiled.framing,
    openingState: day.firestarter ? "close to the lens, looking away to one side" : undefined,
  });

  const rows: Array<{
    slot: string;
    type: string;
    channel: string;
    prompt: string;
    directorModel: string;
    negativePrompt?: string;
  }> = [
    {
      slot: "reel_start_frame",
      type: "photo",
      channel: "reel",
      prompt: startFramePrompt,
      // Binds the generate-media "auto" path straight to Higgsfield Soul V2, the identity-locked
      // image provider, instead of the ad-hoc Google-first default.
      directorModel: "soul2",
      negativePrompt: START_FRAME_FRAMING_NEGATIVES,
    },
    {
      slot: "reel_video",
      type: "video",
      channel: "reel",
      prompt: day.compiled.prompt,
      // Veo is the only wired provider that can render the approved 6.5–8.5s band at all.
      directorModel: "veo",
    },
  ];

  const mediaIds: Record<string, string> = {};
  for (const r of rows) {
    const fields = {
      batch_id: batchId,
      story_day_id: null,
      type: r.type,
      channel: r.channel,
      slot: r.slot,
      shot_archetype: day.archetypeId,
      sequence_index: null,
      higgsfield_prompt: r.prompt,
      visual_signature: {
        ...marker,
        recovery: { ...marker.recovery, ...(r.negativePrompt ? { negative_prompt: r.negativePrompt } : {}) },
        prompt_director: { model: r.directorModel },
      },
      // "completed" here means the PROMPT is ready — the same meaning dailyBatch gives it. The
      // media itself is still pending until a provider actually renders it.
      generation_status: "completed",
      status: "pending",
      hook_text: null,
      visual_tone_used: null,
      styling_note_used: null,
      last_error: null,
      media_url: null,
    };

    const { data: existing } = await supabase
      .from("chs_media")
      .select("id")
      .eq("batch_id", batchId)
      .eq("slot", r.slot)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("chs_media").update(fields).eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      mediaIds[r.slot] = existing.id as string;
    } else {
      const { data, error } = await supabase.from("chs_media").insert(fields).select("id").single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "media insert failed" }, { status: 500 });
      mediaIds[r.slot] = data.id as string;
    }
  }

  return NextResponse.json({
    success: true,
    prepared: {
      slot,
      direction: day.direction,
      characterId,
      date,
      batchId,
      mediaIds,
      targetDurationSec: day.compiled.durationSec,
      providers: { reel_start_frame: "higgsfield-soul (Soul V2)", reel_video: "veo (Veo 3.1 Fast)" },
      motionPrompt: day.compiled.prompt,
      startFramePrompt,
      negativePrompt: day.compiled.negativePrompt,
    },
    next: [
      `POST /api/characters/generate-media { "mediaId": "${mediaIds.reel_start_frame}" }  -> start frame`,
      `POST /api/characters/generate-media { "mediaId": "${mediaIds.reel_video}", "model": "veo" }  -> 8s reel, duration-gated`,
    ],
    note: "Prepared only. Nothing was generated and nothing was published.",
  });
}

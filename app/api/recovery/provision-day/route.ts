import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { compileRecoveryDays, RECOVERY_VERSION } from "@/lib/recovery/recoveryDays";
import { compileRecoveryStartFrame, START_FRAME_FRAMING_NEGATIVES } from "@/lib/recovery/simpleReelCompiler";
import { buildRecoveryStoryScene, findLocationLeaks, generateRecoveryStoryCopy } from "@/lib/recovery/recoveryStory";

export const runtime = "nodejs";
export const maxDuration = 300;

// Provision a calendar day for a recovery index that has no slot yet.
//
// /api/recovery/integrate deliberately refuses to invent a plan — it maps onto what the story
// engine has already produced. That is right for the common case and wrong for exactly one: the
// last recovery reel, whose day the engine has not reached. This route is the explicit,
// operator-triggered exception, and it builds the day the same way the aligned days ended up:
// the recovery brief IS the scene, so caption, hashtags, hook, BTS and reel all derive from it.
//
// Idempotent. Re-running returns the existing day untouched rather than creating a second one.

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { slot?: number; date?: string; apply?: boolean; characterId?: string };
  const slot = Number(body.slot);
  const apply = body.apply === true;
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
    return NextResponse.json({ error: "slot must be 1..5" }, { status: 400 });
  }

  const day = compileRecoveryDays().find((d) => d.slot === slot);
  if (!day) return NextResponse.json({ error: `no recovery day ${slot}` }, { status: 404 });

  let characterId = body.characterId;
  if (!characterId) {
    const { data: chars } = await supabase.from("chs_characters").select("id, name").eq("is_active", true).limit(2);
    if (!chars || chars.length !== 1) {
      return NextResponse.json({ error: "pass characterId — could not resolve a single active character" }, { status: 400 });
    }
    characterId = chars[0].id as string;
  }
  const { data: character } = await supabase.from("chs_characters").select("name").eq("id", characterId).single();

  // The day continues the calendar: the day after the last existing story day, unless told otherwise.
  const { data: lastDay } = await supabase
    .from("chs_story_days")
    .select("day_number, date")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextDate =
    body.date ??
    (() => {
      const d = new Date(`${lastDay?.date ?? new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
  const nextDayNumber = (Number(lastDay?.day_number) || 0) + 1;

  // Idempotency — a day already sitting on this date is returned, never duplicated.
  const { data: existingDay } = await supabase
    .from("chs_story_days")
    .select("id, day_number, date")
    .eq("character_id", characterId)
    .eq("date", nextDate)
    .maybeSingle();
  if (existingDay) {
    return NextResponse.json({
      success: true,
      alreadyExists: true,
      storyDayId: existingDay.id,
      date: existingDay.date,
      dayNumber: existingDay.day_number,
      note: "a story day already occupies this date — nothing created. Run /api/recovery/integrate to map the recovery index onto it.",
    });
  }

  const scene = buildRecoveryStoryScene(day);

  const { data: priorDays } = await supabase
    .from("chs_story_days")
    .select("ig_caption, location")
    .eq("character_id", characterId)
    .lt("date", nextDate)
    .order("date", { ascending: false })
    .limit(3);
  const previousCaptions = (priorDays ?? []).map((d) => String(d.ig_caption ?? "")).filter(Boolean);

  const copy = await generateRecoveryStoryCopy({
    day,
    scene,
    characterName: (character?.name as string) ?? "Vivienne",
    previousCaptions,
    nextDirection: null,
  });

  // Same guard the alignment route uses: copy must stay inside its own scene.
  const forbidden = Array.from(
    new Set(
      (priorDays ?? [])
        .flatMap((d) => String(d.location ?? "").split(/[—,]/))
        .map((s) => s.trim().split(" ")[0])
        .filter((s) => s.length > 3 && /^[A-Z]/.test(s))
    )
  );
  const leaks = findLocationLeaks(copy, forbidden);

  const preview = {
    recoveryIndex: slot,
    date: nextDate,
    dayNumber: nextDayNumber,
    location: scene.location,
    tier: scene.tier,
    caption: copy.ig_caption,
    hashtags: copy.hashtags,
    hook: copy.hook_text,
    locationLeaks: leaks,
  };

  if (!apply) return NextResponse.json({ success: true, dryRun: true, preview, note: "no DB write — pass apply:true" });
  if (leaks.length > 0) {
    return NextResponse.json({ error: `copy names ${leaks.join(", ")} — refusing to write it`, preview }, { status: 422 });
  }

  const { data: storyDay, error: sdErr } = await supabase
    .from("chs_story_days")
    .insert({
      character_id: characterId,
      day_number: nextDayNumber,
      date: nextDate,
      location: scene.location,
      mood: scene.mood,
      narrative: scene.narrative,
      arc_position: scene.arc_position,
      emotional_beat: scene.emotional_beat,
      scene: scene.scene,
      tier: scene.tier,
      ig_caption: copy.ig_caption,
      hashtags: copy.hashtags,
      hook_text: copy.hook_text,
      next_hint: copy.next_hint,
    })
    .select("id")
    .single();
  if (sdErr || !storyDay) return NextResponse.json({ error: sdErr?.message ?? "story day insert failed" }, { status: 500 });

  const marker = {
    recovery_sprint: true,
    recovery_index: slot,
    recovery_total: 5,
    recovery_version: RECOVERY_VERSION,
    direction: day.direction,
    objective: day.objective,
    slot,
    target_duration_sec: day.compiled.durationSec,
    compiler: "simpleReelCompiler",
    integrated_at: new Date().toISOString(),
  };

  const { data: plan, error: planErr } = await supabase
    .from("chs_daily_plans")
    .insert({
      character_id: characterId,
      date: nextDate,
      story_day_id: storyDay.id,
      scene_brief: day.brief as unknown as Record<string, unknown>,
      scene_brief_doctrine:
        `${day.brief.spatial_setup} ${day.brief.wardrobe_lock} Light: ${day.brief.lighting_state}. ` +
        `Real phone photo, natural skin texture, no beauty filter. No legible text, no second face in frame.`,
      batch_status: "ready",
      content_mix: { recovery: marker },
    })
    .select("id")
    .single();
  if (planErr || !plan) return NextResponse.json({ error: planErr?.message ?? "plan insert failed" }, { status: 500 });

  const startFramePrompt = compileRecoveryStartFrame({
    sceneBrief: day.brief,
    framing: day.compiled.framing,
    openingState: day.firestarter ? "close to the lens, looking away to one side" : undefined,
  });

  // The reel slots carry the recovery prompts; story_bts is left EMPTY on purpose so the normal
  // batch flow writes it from the same scene brief, exactly as it does for every other day.
  const rows = [
    {
      slot: "reel_start_frame",
      type: "photo",
      channel: "reel",
      prompt: startFramePrompt,
      model: "soul2",
      negative: START_FRAME_FRAMING_NEGATIVES,
    },
    { slot: "reel_video", type: "video", channel: "reel", prompt: day.compiled.prompt, model: "recovery", negative: undefined },
    { slot: "story_bts", type: "photo", channel: "story", prompt: "", model: "soul2", negative: undefined },
  ];

  const mediaIds: Record<string, string> = {};
  for (const r of rows) {
    const { data, error } = await supabase
      .from("chs_media")
      .insert({
        batch_id: plan.id,
        story_day_id: storyDay.id,
        type: r.type,
        channel: r.channel,
        slot: r.slot,
        shot_archetype: day.archetypeId,
        sequence_index: null,
        higgsfield_prompt: r.prompt,
        visual_signature: {
          recovery: { ...marker, ...(r.negative ? { negative_prompt: r.negative } : {}) },
          prompt_director: { model: r.model },
        },
        generation_status: r.prompt ? "completed" : "pending",
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: `${r.slot}: ${error?.message}` }, { status: 500 });
    mediaIds[r.slot] = data.id as string;
  }

  return NextResponse.json({
    success: true,
    applied: true,
    preview,
    storyDayId: storyDay.id,
    planId: plan.id,
    mediaIds,
    note: "Day created as an ordinary calendar day whose scene IS the recovery brief. story_bts is empty on purpose — run the normal batch so it writes from the same brief.",
  });
}

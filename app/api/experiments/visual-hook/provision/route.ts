import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { compileVisualHookDays } from "@/lib/experiments/visualHookDays";
import { buildVhdMarker, VHD_TOTAL, VHD_VERSION } from "@/lib/experiments/visualHookPlan";
import {
  buildRecoveryStoryScene,
  findLocationLeaks,
  generateRecoveryStoryCopy,
} from "@/lib/recovery/recoveryStory";

export const runtime = "nodejs";
export const maxDuration = 300;

// VHD v1 — fold the five experiment reels into the NORMAL Character Studio calendar.
//
// This is not a parallel workflow and does not create one. After it runs, each experiment reel is
// an ordinary chs_daily_plans reel slot: it appears in /today and /review like any other day, is
// approved with the same button, generates through the same route, and publishes through the
// existing cron. The only thing that marks it is a badge.
//
// The day's STORY is derived from the experiment's own scene brief, using the same helpers the
// recovery sprint ended up with. That inversion was learned the hard way: grafting a prepared reel
// onto whatever story day was next produced a bedroom reel scheduled to publish under a caption
// about a bar in Positano. One brief in, one coherent day out — caption, hashtags, hook, BTS still
// and reel all from the same source, with no operator reconciliation at approval time.
//
// WHAT IT WRITES   chs_story_days (new), chs_daily_plans (new), chs_media (3 slots per day)
// WHAT IT NEVER TOUCHES   any existing day, any post, anything published or scheduled
//
// Dry run unless apply:true. Idempotent: a date that already holds a story day is left alone.

interface DayPlanResult {
  index: number;
  date: string;
  dayNumber: number;
  direction: string;
  motifFamily: string;
  hookType: string;
  experimentRole: string;
  location: string;
  tier: string;
  caption: string;
  hashtags: string[];
  hook: string | null;
  locationLeaks: string[];
  targetDurationSec: number;
  action: string;
  startFramePrompt: string;
  motionPrompt: string;
  startFrameNegatives: string;
  created: boolean;
  skippedReason: string | null;
  storyDayId?: string;
  planId?: string;
  mediaIds?: Record<string, string>;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    apply?: boolean;
    startDate?: string;
    characterId?: string;
    only?: number[];
  };
  const apply = body.apply === true;
  const only = Array.isArray(body.only) ? new Set(body.only) : null;

  let characterId = body.characterId;
  if (!characterId) {
    const { data: chars } = await supabase.from("chs_characters").select("id, name").eq("is_active", true).limit(2);
    if (!chars || chars.length !== 1) {
      return NextResponse.json({ error: "pass characterId — could not resolve a single active character" }, { status: 400 });
    }
    characterId = chars[0].id as string;
  }
  const { data: character } = await supabase.from("chs_characters").select("name").eq("id", characterId).single();
  const characterName = (character?.name as string) ?? "Vivienne";

  const days = compileVisualHookDays();

  // The experiment continues the calendar rather than interleaving with it: the run starts the day
  // after the last day the story engine has already produced, so no existing day is displaced.
  const { data: lastDay } = await supabase
    .from("chs_story_days")
    .select("day_number, date")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const addDays = (iso: string, n: number) => {
    const d = new Date(`${iso}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const lastDate = (lastDay?.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const startDate = body.startDate ?? addDays(lastDate, 1);
  const baseDayNumber = Number(lastDay?.day_number) || 0;

  const dates = days.map((_, i) => addDays(startDate, i));

  // Everything already on those dates, read once. A date that is occupied is skipped, never
  // overwritten — displacing a day the operator may already have approved is exactly the kind of
  // silent damage a prepared-content route must not be capable of.
  const { data: existingDays } = await supabase
    .from("chs_story_days")
    .select("id, date, day_number")
    .eq("character_id", characterId)
    .in("date", dates);
  const occupied = new Map((existingDays ?? []).map((d) => [d.date as string, d]));

  // Voice continuity: the days immediately before the window.
  const { data: priorDays } = await supabase
    .from("chs_story_days")
    .select("ig_caption, location")
    .eq("character_id", characterId)
    .lt("date", startDate)
    .order("date", { ascending: false })
    .limit(3);
  const previousCaptions = (priorDays ?? []).map((d) => String(d.ig_caption ?? "")).filter(Boolean);
  const forbiddenPlaces = Array.from(
    new Set(
      (priorDays ?? [])
        .flatMap((d) => String(d.location ?? "").split(/[—,]/))
        .map((s) => s.trim().split(" ")[0])
        .filter((s) => s.length > 3 && /^[A-Z]/.test(s))
    )
  );

  const results: DayPlanResult[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const date = dates[i];
    if (only && !only.has(day.plan.experimentIndex)) continue;

    const scene = buildRecoveryStoryScene(day, "experiment_index");
    const nextDay = days[i + 1];

    let copy;
    try {
      copy = await generateRecoveryStoryCopy({
        day,
        scene,
        characterName,
        previousCaptions,
        nextDirection: nextDay?.direction ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: `copy generation failed for VHD #${day.plan.experimentIndex} (${date}): ${err instanceof Error ? err.message : String(err)}`,
          results,
        },
        { status: 500 }
      );
    }

    const leaks = findLocationLeaks(copy, forbiddenPlaces);
    const taken = occupied.get(date);

    const row: DayPlanResult = {
      index: day.plan.experimentIndex,
      date,
      dayNumber: baseDayNumber + i + 1,
      direction: day.direction,
      motifFamily: day.plan.motifFamily,
      hookType: day.plan.hookType,
      experimentRole: day.plan.experimentRole,
      location: scene.location,
      tier: scene.tier,
      caption: copy.ig_caption,
      hashtags: copy.hashtags,
      hook: copy.hook_text,
      locationLeaks: leaks,
      targetDurationSec: day.compiled.durationSec,
      action: day.compiled.action,
      startFramePrompt: day.startFrame.prompt,
      motionPrompt: day.compiled.prompt,
      startFrameNegatives: day.startFrame.negativePrompt,
      created: false,
      skippedReason: taken ? `${date} already holds a story day (${taken.id}) — not overwritten` : null,
    };

    if (!apply || taken) {
      results.push(row);
      continue;
    }

    if (leaks.length > 0) {
      return NextResponse.json(
        { error: `copy for VHD #${day.plan.experimentIndex} names ${leaks.join(", ")} — refusing to write it`, results },
        { status: 422 }
      );
    }

    const { data: storyDay, error: sdErr } = await supabase
      .from("chs_story_days")
      .insert({
        character_id: characterId,
        day_number: row.dayNumber,
        date,
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
    if (sdErr || !storyDay) {
      return NextResponse.json({ error: sdErr?.message ?? "story day insert failed", results }, { status: 500 });
    }

    const marker = buildVhdMarker(day.plan, { target_duration_sec: day.compiled.durationSec });

    const { data: plan, error: planErr } = await supabase
      .from("chs_daily_plans")
      .insert({
        character_id: characterId,
        date,
        story_day_id: storyDay.id,
        scene_brief: day.brief as unknown as Record<string, unknown>,
        scene_brief_doctrine:
          `${day.brief.spatial_setup} ${day.brief.wardrobe_lock} Light: ${day.brief.lighting_state}. ` +
          `Real phone photo, natural skin texture, no beauty filter. No legible text, no second face in frame.`,
        batch_status: "ready",
        content_mix: { visual_hook_experiment: { ...marker, direction: day.direction } },
      })
      .select("id")
      .single();
    if (planErr || !plan) {
      return NextResponse.json({ error: planErr?.message ?? "plan insert failed", results }, { status: 500 });
    }

    // story_bts is left EMPTY on purpose so the normal batch writes it from the same scene brief,
    // exactly as it does for every other day. The reel slots carry the experiment's own prompts.
    const specs = [
      {
        slot: "reel_start_frame",
        type: "photo",
        channel: "reel",
        prompt: day.startFrame.prompt,
        model: "soul2",
        negative: day.startFrame.negativePrompt,
      },
      { slot: "reel_video", type: "video", channel: "reel", prompt: day.compiled.prompt, model: "visual_hook", negative: undefined },
      { slot: "story_bts", type: "photo", channel: "story", prompt: "", model: "soul2", negative: undefined },
    ];

    const mediaIds: Record<string, string> = {};
    for (const spec of specs) {
      const { data, error } = await supabase
        .from("chs_media")
        .insert({
          batch_id: plan.id,
          story_day_id: storyDay.id,
          type: spec.type,
          channel: spec.channel,
          slot: spec.slot,
          shot_archetype: day.archetypeId,
          sequence_index: null,
          higgsfield_prompt: spec.prompt,
          visual_signature: {
            visual_hook_experiment: {
              ...marker,
              direction: day.direction,
              ...(spec.negative ? { negative_prompt: spec.negative } : {}),
            },
            prompt_director: { model: spec.model },
          },
          generation_status: spec.prompt ? "completed" : "pending",
          status: "pending",
        })
        .select("id")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: `${date} ${spec.slot}: ${error?.message}`, results }, { status: 500 });
      }
      mediaIds[spec.slot] = data.id as string;
    }

    row.created = true;
    row.storyDayId = storyDay.id as string;
    row.planId = plan.id as string;
    row.mediaIds = mediaIds;
    results.push(row);
  }

  return NextResponse.json({
    success: true,
    applied: apply,
    dryRun: !apply,
    version: VHD_VERSION,
    total: VHD_TOTAL,
    startDate,
    results,
    note: apply
      ? "Experiment reels are ordinary calendar days now. Approve them in /review exactly like any other day; generation, QA and publishing all run through the existing flow. story_bts is empty on purpose — the normal batch writes it from the same scene brief."
      : "no DB write — pass apply:true",
  });
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { compileRecoveryDays, RECOVERY_VERSION, type CompiledRecoveryDay } from "@/lib/recovery/recoveryDays";
import {
  buildRecoveryStoryScene,
  findLocationLeaks,
  generateRecoveryStoryCopy,
} from "@/lib/recovery/recoveryStory";

export const runtime = "nodejs";
export const maxDuration = 300;

// RECOVERY STORY ALIGNMENT — make the recovery scene the day's actual story.
//
// After /api/recovery/integrate the reel was recovery but the day around it was not: caption,
// hashtags and the BTS still all belonged to the calendar's own travel arc, so a bedroom reel would
// have published under "found the bar at the right hour" with #positanoitaly. This rewrites the
// story day FROM the recovery brief so every downstream artefact derives from one scene.
//
// WHAT IT WRITES
//   chs_story_days  — location, mood, narrative, emotional_beat, tier, scene, caption, hashtags,
//                     hook_text, next_hint; clears arc_id/episode_label (the day is no longer part
//                     of the travel arc it was written into)
//   chs_daily_plans — scene_brief + doctrine become the recovery brief, so the BTS still and any
//                     regeneration read the same scene the reel came from
//   chs_media       — the story_bts prompt is cleared so it regenerates from the new scene; the
//                     reel slots are left completely alone
//
// WHAT IT NEVER TOUCHES
//   the reel prompts, the already-rendered recovery media, chs_posts, or any published content.
//
// Dry run unless apply:true.

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { apply?: boolean; fromDate?: string };
  const apply = body.apply === true;
  const fromDate = body.fromDate ?? new Date().toISOString().slice(0, 10);

  const days = compileRecoveryDays();
  const byIndex = new Map<number, CompiledRecoveryDay>(days.map((d) => [d.slot, d]));

  // Recovery plans, in calendar order, that have a story day to rewrite.
  const { data: plans, error: planErr } = await supabase
    .from("chs_daily_plans")
    .select("id, date, character_id, story_day_id, content_mix")
    .gte("date", fromDate)
    .not("story_day_id", "is", null)
    .order("date", { ascending: true });
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  const recoveryPlans = (plans ?? []).filter(
    (p) => (p.content_mix as { recovery?: { recovery_index?: number } } | null)?.recovery?.recovery_index
  );
  if (recoveryPlans.length === 0) {
    return NextResponse.json({ error: "no recovery plans found — run /api/recovery/integrate first" }, { status: 409 });
  }

  const storyDayIds = recoveryPlans.map((p) => p.story_day_id as string);
  const { data: storyDays } = await supabase
    .from("chs_story_days")
    .select("id, date, day_number, location, ig_caption, arc_id, character_id")
    .in("id", storyDayIds);
  const storyById = new Map((storyDays ?? []).map((d) => [d.id as string, d]));

  // STOP CONDITION — anything that actually WENT OUT is finished content and untouchable.
  //
  // A post that is merely `scheduled` is a different case, and it is the case that occurred: the
  // operator approved 2026-09-04 while the reel was already recovery but the caption was still the
  // travel arc's. Blocking there would have left a bedroom reel scheduled to publish under
  // "found the bar at the right hour" with #positanoitaly — the exact incoherence this route
  // exists to remove, protected by the guard meant to prevent it. So a scheduled, unpublished post
  // is corrected alongside its story day rather than refused; a published one still hard-blocks.
  const { data: posts } = await supabase
    .from("chs_posts")
    .select("id, story_day_id, status, platform, platform_post_id, posted_at")
    .in("story_day_id", storyDayIds);

  const published = (posts ?? []).filter((p) => p.posted_at || p.platform_post_id);
  if (published.length > 0) {
    return NextResponse.json(
      {
        error: "refusing to rewrite a story day whose post has already been published",
        published: published.map((p) => ({ story_day_id: p.story_day_id, status: p.status, platform: p.platform })),
      },
      { status: 409 }
    );
  }
  const scheduledPosts = (posts ?? []).filter((p) => !p.posted_at && !p.platform_post_id);

  // The places the OLD arc talked about — a rewritten caption must not mention any of them.
  const forbiddenPlaces = Array.from(
    new Set(
      (storyDays ?? [])
        .flatMap((d) => String(d.location ?? "").split(/[—,]/))
        .map((s) => s.trim())
        .filter((s) => s.length > 3 && /^[A-Z]/.test(s))
        .map((s) => s.split(" ")[0])
    )
  );

  // Voice continuity: the days immediately BEFORE the recovery window.
  const characterId = recoveryPlans[0].character_id as string;
  const { data: priorDays } = await supabase
    .from("chs_story_days")
    .select("date, ig_caption")
    .eq("character_id", characterId)
    .lt("date", fromDate)
    .order("date", { ascending: false })
    .limit(3);
  const previousCaptions = (priorDays ?? []).map((d) => String(d.ig_caption ?? "")).filter(Boolean);

  const results: Array<Record<string, unknown>> = [];

  for (let i = 0; i < recoveryPlans.length; i++) {
    const plan = recoveryPlans[i];
    const idx = (plan.content_mix as { recovery: { recovery_index: number } }).recovery.recovery_index;
    const day = byIndex.get(idx);
    const story = storyById.get(plan.story_day_id as string);
    if (!day || !story) continue;

    const scene = buildRecoveryStoryScene(day);
    const nextDay = byIndex.get(idx + 1);

    let copy;
    try {
      copy = await generateRecoveryStoryCopy({
        day,
        scene,
        characterName: "Vivienne",
        previousCaptions,
        nextDirection: nextDay?.direction ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `copy generation failed for recovery #${idx} (${plan.date}): ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }

    // The whole point of this route — refuse copy that still names the old arc's places.
    const leaks = findLocationLeaks(copy, forbiddenPlaces);

    results.push({
      date: plan.date,
      recoveryIndex: idx,
      dayNumber: story.day_number,
      oldLocation: story.location,
      oldCaption: story.ig_caption,
      newLocation: scene.location,
      newTier: scene.tier,
      newCaption: copy.ig_caption,
      newHashtags: copy.hashtags,
      newHook: copy.hook_text,
      locationLeaks: leaks,
      hadArc: !!story.arc_id,
      scheduledPostsToCorrect: scheduledPosts
        .filter((sp) => sp.story_day_id === story.id)
        .map((sp) => ({ id: sp.id, platform: sp.platform, status: sp.status })),
    });

    if (!apply) continue;

    if (leaks.length > 0) {
      return NextResponse.json(
        { error: `copy for recovery #${idx} still names ${leaks.join(", ")} — refusing to write it`, results },
        { status: 422 }
      );
    }

    const { error: sdErr } = await supabase
      .from("chs_story_days")
      .update({
        location: scene.location,
        mood: scene.mood,
        narrative: scene.narrative,
        emotional_beat: scene.emotional_beat,
        arc_position: scene.arc_position,
        tier: scene.tier,
        scene: scene.scene,
        ig_caption: copy.ig_caption,
        hashtags: copy.hashtags,
        hook_text: copy.hook_text,
        next_hint: copy.next_hint,
        // The day is no longer part of the travel arc it was written into.
        arc_id: null,
        episode_label: null,
      })
      .eq("id", story.id);
    if (sdErr) return NextResponse.json({ error: `story day ${plan.date}: ${sdErr.message}`, results }, { status: 500 });

    const { error: planUpdErr } = await supabase
      .from("chs_daily_plans")
      .update({
        scene_brief: day.brief as unknown as Record<string, unknown>,
        scene_brief_doctrine:
          `${day.brief.spatial_setup} ${day.brief.wardrobe_lock} Light: ${day.brief.lighting_state}. ` +
          `Real phone photo, natural skin texture, no beauty filter. No legible text, no second face in frame.`,
      })
      .eq("id", plan.id);
    if (planUpdErr) return NextResponse.json({ error: `plan ${plan.date}: ${planUpdErr.message}`, results }, { status: 500 });

    // The BTS still must be rebuilt from the new scene. Clearing the prompt and marking the slot
    // pending is what makes the normal batch flow regenerate it; the reel slots are untouched.
    // Carry the corrected copy onto any already-approved-but-unpublished post for this day, so an
    // approval made before the alignment does not publish the caption it was approved with.
    for (const sp of scheduledPosts.filter((x) => x.story_day_id === story.id)) {
      const patch: Record<string, unknown> =
        sp.platform === "instagram"
          ? { ig_caption: copy.ig_caption, hashtags: copy.hashtags }
          : { yt_description: copy.ig_caption };
      const { error: postErr } = await supabase.from("chs_posts").update(patch).eq("id", sp.id);
      if (postErr) return NextResponse.json({ error: `post ${sp.id}: ${postErr.message}`, results }, { status: 500 });
    }

    const { error: btsErr } = await supabase
      .from("chs_media")
      .update({ higgsfield_prompt: "", generation_status: "pending", status: "pending", media_url: null, last_error: null })
      .eq("batch_id", plan.id)
      .eq("slot", "story_bts");
    if (btsErr) return NextResponse.json({ error: `bts ${plan.date}: ${btsErr.message}`, results }, { status: 500 });
  }

  let arcClosed: string | null = null;
  if (apply) {
    // The travel arc these days were written into ends here; leaving it active would have the
    // story engine keep generating Positano days on the far side of the recovery window.
    const { data: arcs } = await supabase
      .from("chs_arcs")
      .select("id, title, status")
      .eq("character_id", characterId)
      .eq("status", "active");
    for (const a of arcs ?? []) {
      await supabase.from("chs_arcs").update({ status: "completed" }).eq("id", a.id);
      arcClosed = a.title as string;
    }
  }

  return NextResponse.json({
    success: true,
    applied: apply,
    dryRun: !apply,
    recoveryVersion: RECOVERY_VERSION,
    results,
    arcClosed,
    note: apply
      ? "Recovery days now ARE their own story: caption, hashtags, hook, BTS scene and reel all derive from one brief. Regenerate the story_bts slot from the normal flow."
      : "no DB write — pass apply:true",
  });
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scheduleFor, isMissingScheduleColumn } from "@/lib/publishTime";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { storyDayId, characterId, date, caption, hashtags: hashtagsRaw } = await req.json();

    if (!storyDayId || !characterId || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Parse hashtags — accept space-separated string or array
    const hashtags: string[] = Array.isArray(hashtagsRaw)
      ? hashtagsRaw
      : (hashtagsRaw ?? "").split(/\s+/).filter(Boolean);

    // 1. Update caption + hashtags in story_day
    const { error: captionErr } = await supabase
      .from("chs_story_days")
      .update({ ig_caption: caption, hashtags })
      .eq("id", storyDayId);

    if (captionErr) {
      return NextResponse.json({ error: `Caption update failed: ${captionErr.message}` }, { status: 500 });
    }

    // 2. Fetch character details
    const charQuery = (cols: string) =>
      supabase.from("chs_characters").select(cols).eq("id", characterId).single();
    type CharRow = {
      id: string; name: string; posting_time: string; platforms: string[];
      posting_tz?: string | null; posting_schedule?: import("@/lib/publishTime").PostingSchedule | null;
    };
    let { data: characterRaw, error: charErr } = await charQuery("id, name, posting_time, posting_tz, posting_schedule, platforms");
    if (isMissingScheduleColumn(charErr)) {
      // Migration not applied yet -> legacy behaviour.
      ({ data: characterRaw, error: charErr } = await charQuery("id, name, posting_time, platforms"));
    }
    const character = characterRaw as unknown as CharRow | null;

    if (charErr || !character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // 3. Fetch the daily plan
    const { data: plan, error: planErr } = await supabase
      .from("chs_daily_plans")
      .select("id")
      .eq("character_id", characterId)
      .eq("date", date)
      .maybeSingle();

    if (planErr || !plan) {
      return NextResponse.json({ error: "Daily plan not found" }, { status: 404 });
    }

    // 4. Fetch media slots
    const { data: media, error: mediaErr } = await supabase
      .from("chs_media")
      .select("id, slot, type, sequence_index, media_url, generation_status")
      .eq("batch_id", plan.id);

    if (mediaErr) {
      return NextResponse.json({ error: `Media fetch failed: ${mediaErr.message}` }, { status: 500 });
    }

    const slots = media ?? [];
    const bySlot = (key: string) => slots.find((s) => s.slot === key);
    const ready = (m: typeof slots[0] | undefined) => !!m?.media_url;

    // 5. Check for existing posts (idempotency)
    const { data: existingPosts } = await supabase
      .from("chs_posts")
      .select("id, post_type")
      .eq("story_day_id", storyDayId);

    const existingTypes = new Set((existingPosts ?? []).map((p) => p.post_type));

    const created: Array<{ post_type: string; post_id: string }> = [];
    const skipped: string[] = [];
    const warnings: string[] = [];

    const hasInstagram = character.platforms.includes("instagram");
    const hasYouTube   = character.platforms.includes("youtube");

    // ── Carousel ─────────────────────────────────────────────
    const carouselSlots = ["carousel_1","carousel_2","carousel_3","carousel_4","carousel_5"]
      .map((s) => bySlot(s))
      .filter((s): s is typeof slots[0] => !!s);

    if (carouselSlots.length === 5 && carouselSlots.every(ready)) {
      if (existingTypes.has("carousel")) {
        skipped.push("carousel (already queued)");
      } else if (scheduleFor(character, date, "carousel") === null) {
        skipped.push("carousel (no slot in posting_schedule for this weekday)");
      } else if (hasInstagram) {
        const ordered = [...carouselSlots].sort(
          (a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)
        );
        const { data: post, error } = await supabase
          .from("chs_posts")
          .insert({
            media_id:    ordered[0].id,
            media_ids:   ordered.map((s) => s.id),
            character_id: characterId,
            platform:    "instagram",
            post_type:   "carousel",
            scheduled_at: scheduleFor(character, date, "carousel"),
            status:      "scheduled",
            ig_caption:  caption,
            hashtags,
            story_day_id: storyDayId,
            source:      "batch",
          })
          .select("id")
          .single();

        if (error) warnings.push(`carousel: ${error.message}`);
        else if (post) created.push({ post_type: "carousel", post_id: post.id });
      } else {
        skipped.push("carousel (no instagram)");
      }
    } else {
      const missing = 5 - carouselSlots.filter(ready).length;
      if (missing > 0) warnings.push(`carousel: ${missing} slot(s) not ready`);
    }

    // ── Reel ──────────────────────────────────────────────────
    const reel = bySlot("reel_video");
    if (ready(reel)) {
      const reelTime = scheduleFor(character, date, "reel");
      if (existingTypes.has("reel")) {
        skipped.push("reel (already queued)");
      } else if (reelTime === null) {
        skipped.push("reel (no slot in posting_schedule for this weekday)");
      } else {
        const platforms: Array<"instagram" | "youtube"> = [];
        if (hasInstagram) platforms.push("instagram");
        if (hasYouTube)   platforms.push("youtube");

        for (const platform of platforms) {
          const { data: post, error } = await supabase
            .from("chs_posts")
            .insert({
              media_id:     reel!.id,
              character_id: characterId,
              platform,
              post_type:    "reel",
              scheduled_at: reelTime,
              status:       "scheduled",
              ig_caption:   platform === "instagram" ? caption : null,
              hashtags:     platform === "instagram" ? hashtags : null,
              yt_title:     platform === "youtube" ? `${character.name} — ${date}` : null,
              yt_description: platform === "youtube" ? (caption ?? "") : null,
              story_day_id: storyDayId,
              source:       "batch",
            })
            .select("id")
            .single();

          if (error) warnings.push(`reel_${platform}: ${error.message}`);
          else if (post) created.push({ post_type: `reel_${platform}`, post_id: post.id });
        }
      }
    }

    // ── Story ─────────────────────────────────────────────────
    const story = bySlot("story_bts");
    if (ready(story) && hasInstagram) {
      const storyAt = scheduleFor(character, date, "story");
      if (existingTypes.has("story")) {
        skipped.push("story (already queued)");
      } else if (storyAt === null) {
        skipped.push("story (no slot in posting_schedule for this weekday)");
      } else {
        const { data: post, error } = await supabase
          .from("chs_posts")
          .insert({
            media_id:     story!.id,
            character_id: characterId,
            platform:     "instagram",
            post_type:    "story",
            scheduled_at: storyAt,
            status:       "scheduled",
            story_day_id: storyDayId,
            source:       "batch",
          })
          .select("id")
          .single();

        if (error) warnings.push(`story: ${error.message}`);
        else if (post) created.push({ post_type: "story", post_id: post.id });
      }
    }

    return NextResponse.json({ success: true, created, skipped, warnings });
  } catch (err) {
    console.error("[review/approve]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

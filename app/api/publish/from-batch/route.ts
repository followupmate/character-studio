import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scheduledIso } from "@/lib/publishTime";
import { requireCron } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SlotMedia {
  id: string;
  slot: string;
  sequence_index: number | null;
  media_url: string | null;
  generation_status: string | null;
}

interface Character {
  id: string;
  name: string;
  posting_time: string;
  platforms: string[];
  fanvue_link: string | null;
}

interface StoryDay {
  id: string;
  character_id: string;
  date: string;
  ig_caption: string | null;
  hashtags: string[] | null;
}

interface DailyPlan {
  id: string;
  character_id: string;
  story_day_id: string | null;
}

interface PerCharacterResult {
  character: string;
  story_day_date: string | null;
  created: Array<{ post_type: string; post_id: string }>;
  skipped: string[];
  warnings: string[];
}

async function processCharacter(
  char: Character,
  date: string
): Promise<PerCharacterResult> {
  const result: PerCharacterResult = {
    character: char.name,
    story_day_date: null,
    created: [],
    skipped: [],
    warnings: [],
  };

  const { data: storyDay } = await supabase
    .from("chs_story_days")
    .select("id, character_id, date, ig_caption, hashtags")
    .eq("character_id", char.id)
    .eq("date", date)
    .maybeSingle();

  if (!storyDay) {
    result.warnings.push("no story_day for this date");
    return result;
  }

  result.story_day_date = (storyDay as StoryDay).date;

  const { data: plan } = await supabase
    .from("chs_daily_plans")
    .select("id, character_id, story_day_id")
    .eq("character_id", char.id)
    .eq("date", date)
    .maybeSingle();

  if (!plan) {
    result.warnings.push("no daily_plan for this date");
    return result;
  }

  const { data: media } = await supabase
    .from("chs_media")
    .select("id, slot, sequence_index, media_url, generation_status")
    .eq("batch_id", (plan as DailyPlan).id);

  if (!media || media.length === 0) {
    result.warnings.push("no batch media");
    return result;
  }

  const slots = media as SlotMedia[];
  const bySlot = (key: string) => slots.find((s) => s.slot === key);
  const ready = (m: SlotMedia | undefined) => !!m?.media_url;

  // Existing posts for this story_day to enforce idempotency
  const { data: existingPosts } = await supabase
    .from("chs_posts")
    .select("id, post_type")
    .eq("story_day_id", (storyDay as StoryDay).id);

  const existingTypes = new Set(((existingPosts as Array<{ post_type: string }>) ?? []).map((p) => p.post_type));

  // IG → Fanvue funnel: if the day's unlock draft carries an ig_cta (rate-limited
  // to ~25–35% of days by the fanvue layer), append it to the public caption.
  // The CTA points at the bio link (char.fanvue_link goes into the IG bio / story sticker).
  let captionFromStory = (storyDay as StoryDay).ig_caption;
  const { data: unlockDraft } = await supabase
    .from("chs_fanvue_unlocks")
    .select("ig_cta")
    .eq("story_day_id", (storyDay as StoryDay).id)
    .not("ig_cta", "is", null)
    .limit(1)
    .maybeSingle();
  if (captionFromStory && unlockDraft?.ig_cta) {
    captionFromStory = `${captionFromStory}\n\n${unlockDraft.ig_cta} — link in bio 🔗`;
  }

  const hashtagsFromStory = (storyDay as StoryDay).hashtags ?? [];
  const hasInstagram = char.platforms.includes("instagram");
  const hasYouTube = char.platforms.includes("youtube");

  // 1) Carousel — queue once every carousel slot that EXISTS for this batch is ready.
  // The batch pre-reserves its carousel rows up front (5 in default, 3 in discovery
  // mode), so carouselSlots.length is the expected count and .every(ready) waits for
  // exactly those. Min 2 (IG requires ≥2 slides).
  const carouselSlots = ["carousel_1", "carousel_2", "carousel_3", "carousel_4", "carousel_5"]
    .map((s) => bySlot(s))
    .filter((s): s is SlotMedia => !!s);

  if (carouselSlots.length >= 2 && carouselSlots.every(ready)) {
    if (existingTypes.has("carousel")) {
      result.skipped.push("carousel (already queued)");
    } else if (hasInstagram) {
      const ordered = [...carouselSlots].sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
      const { data: post, error } = await supabase
        .from("chs_posts")
        .insert({
          media_id: ordered[0].id,
          media_ids: ordered.map((s) => s.id),
          character_id: char.id,
          platform: "instagram",
          post_type: "carousel",
          scheduled_at: scheduledIso(date, char.posting_time, 0),
          status: "scheduled",
          ig_caption: captionFromStory,
          hashtags: hashtagsFromStory,
          story_day_id: (storyDay as StoryDay).id,
          source: "batch",
        })
        .select("id")
        .single();

      if (error) result.warnings.push(`carousel: ${error.message}`);
      else if (post) result.created.push({ post_type: "carousel", post_id: post.id });
    } else {
      result.skipped.push("carousel (no instagram platform)");
    }
  } else {
    // Not ready: count the reserved carousel rows that still lack media.
    const missing = carouselSlots.filter((s) => !ready(s)).length;
    if (missing > 0) result.warnings.push(`carousel: ${missing} slot(s) not ready`);
  }

  // NOTE: reel_start_frame is intentionally NOT queued — it's a Kling helper asset.
  // User feeds it to Kling 3.0 as image-to-video input; the resulting video lands in reel_video slot.

  // 2) Reel — instagram + youtube (if both platforms enabled)
  const reel = bySlot("reel_video");
  if (ready(reel)) {
    if (existingTypes.has("reel")) {
      result.skipped.push("reel (already queued)");
    } else {
      const reelTime = scheduledIso(date, char.posting_time, 8 * 60); // +8h, prime time
      const platforms: Array<"instagram" | "youtube"> = [];
      if (hasInstagram) platforms.push("instagram");
      if (hasYouTube) platforms.push("youtube");

      for (const platform of platforms) {
        const { data: post, error } = await supabase
          .from("chs_posts")
          .insert({
            media_id: reel!.id,
            character_id: char.id,
            platform,
            post_type: "reel",
            scheduled_at: reelTime,
            status: "scheduled",
            ig_caption: platform === "instagram" ? captionFromStory : null,
            hashtags: platform === "instagram" ? hashtagsFromStory : null,
            yt_title: platform === "youtube" ? `${char.name} — ${date}` : null,
            yt_description: platform === "youtube" ? (captionFromStory ?? "") : null,
            story_day_id: (storyDay as StoryDay).id,
            source: "batch",
          })
          .select("id")
          .single();

        if (error) result.warnings.push(`reel ${platform}: ${error.message}`);
        else if (post) result.created.push({ post_type: `reel_${platform}`, post_id: post.id });
      }
    }
  } else if (reel) {
    result.warnings.push("reel: media not ready");
  }

  // 3) Story — instagram only, +90min after carousel
  const story = bySlot("story_bts");
  if (ready(story) && hasInstagram) {
    if (existingTypes.has("story")) {
      result.skipped.push("story (already queued)");
    } else {
      const { data: post, error } = await supabase
        .from("chs_posts")
        .insert({
          media_id: story!.id,
          character_id: char.id,
          platform: "instagram",
          post_type: "story",
          scheduled_at: scheduledIso(date, char.posting_time, 90),
          status: "scheduled",
          story_day_id: (storyDay as StoryDay).id,
          source: "batch",
          // Default link sticker → Fanvue (per-character funnel link); the publish
          // route already renders story_link_url as an IG link sticker.
          story_link_url: char.fanvue_link || null,
        })
        .select("id")
        .single();

      if (error) result.warnings.push(`story: ${error.message}`);
      else if (post) result.created.push({ post_type: "story", post_id: post.id });
    }
  } else if (story && !ready(story)) {
    result.warnings.push("story: media not ready");
  }

  return result;
}

async function handle(req: Request): Promise<NextResponse> {
  const deny = requireCron(req);
  if (deny) return deny;

  try {
    const url = new URL(req.url);
    const characterId = url.searchParams.get("character_id");
    const dateParam = url.searchParams.get("date");
    const date = dateParam ?? new Date().toISOString().split("T")[0];

    let charQuery = supabase
      .from("chs_characters")
      .select("id, name, posting_time, platforms, fanvue_link")
      .eq("is_active", true);

    if (characterId) {
      charQuery = charQuery.eq("id", characterId);
    }

    const { data: characters, error: charErr } = await charQuery;
    if (charErr) throw charErr;
    if (!characters || characters.length === 0) {
      return NextResponse.json({ success: true, processed: [] });
    }

    const results: PerCharacterResult[] = [];
    for (const char of characters as Character[]) {
      results.push(await processCharacter(char, date));
    }

    const totalCreated = results.reduce((s, r) => s + r.created.length, 0);
    return NextResponse.json({ success: true, date, totalCreated, processed: results });
  } catch (error) {
    console.error("[from-batch]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }

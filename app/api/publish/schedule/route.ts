import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface ScheduleBody {
  character_id: string;
  platforms: string[];
  scheduled_at: string;
  ig_caption: string;
  hashtags: string[];
  yt_title: string;
  yt_description: string;
  file_paths: {
    video?: string;
    photo1?: string;
    photo2?: string;
  };
  post_now: boolean;
  include_story?: boolean;
  story_file_key?: string; // which file key to use for story (e.g. 'photo1')
  story_link_url?: string;
}

export async function POST(req: Request) {
  try {
    const body: ScheduleBody = await req.json();
    const {
      character_id,
      platforms,
      scheduled_at,
      ig_caption,
      hashtags,
      yt_title,
      yt_description,
      file_paths,
      post_now,
      include_story = false,
      story_file_key,
      story_link_url,
    } = body;

    const post_ids: string[] = [];
    const media_ids: string[] = [];

    // Build media records from uploaded files
    const mediaEntries: Array<{ type: "photo" | "video"; path: string; key: string }> = [];

    if (file_paths.video) {
      mediaEntries.push({ type: "video", path: file_paths.video, key: "video" });
    }
    if (file_paths.photo1) {
      mediaEntries.push({ type: "photo", path: file_paths.photo1, key: "photo1" });
    }
    if (file_paths.photo2) {
      mediaEntries.push({ type: "photo", path: file_paths.photo2, key: "photo2" });
    }

    if (mediaEntries.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Track file_key → media_id for story linking
    const keyToMediaId: Record<string, string> = {};
    // Track first Instagram post ID for parent_post_id on story
    let firstIgPostId: string | null = null;

    const scheduledAtIso = scheduled_at || new Date().toISOString();

    for (const { type, path, key } of mediaEntries) {
      const { data: { publicUrl } } = supabase.storage
        .from("chs-media")
        .getPublicUrl(path);

      const { data: media, error: mediaError } = await supabase
        .from("chs_media")
        .insert({
          story_day_id: null,
          type,
          higgsfield_prompt: "manual_upload",
          media_url: publicUrl,
          status: "ready",
          is_manual: true,
        })
        .select("id")
        .single();

      if (mediaError) throw mediaError;
      media_ids.push(media.id);
      keyToMediaId[key] = media.id;

      for (const platform of platforms) {
        const { data: post, error: postError } = await supabase
          .from("chs_posts")
          .insert({
            media_id: media.id,
            character_id,
            platform,
            post_type: "feed",
            scheduled_at: scheduledAtIso,
            status: "scheduled",
            ig_caption: ["instagram"].includes(platform) ? ig_caption : null,
            hashtags: ["instagram"].includes(platform) ? hashtags : null,
            yt_title: platform === "youtube" ? yt_title : null,
            yt_description: platform === "youtube" ? yt_description : null,
          })
          .select("id")
          .single();

        if (postError) throw postError;
        post_ids.push(post.id);

        if (platform === "instagram" && firstIgPostId === null) {
          firstIgPostId = post.id;
        }
      }
    }

    // Create story post +1.5h after feed post
    if (include_story && platforms.includes("instagram") && story_file_key && keyToMediaId[story_file_key]) {
      const storyScheduledAt = new Date(scheduledAtIso);
      storyScheduledAt.setMinutes(storyScheduledAt.getMinutes() + 90); // +1.5h

      const { data: storyPost, error: storyError } = await supabase
        .from("chs_posts")
        .insert({
          media_id: keyToMediaId[story_file_key],
          character_id,
          platform: "instagram",
          post_type: "story",
          story_link_url: story_link_url || null,
          parent_post_id: firstIgPostId,
          scheduled_at: storyScheduledAt.toISOString(),
          status: "scheduled",
        })
        .select("id")
        .single();

      if (storyError) throw storyError;
      post_ids.push(storyPost.id);
    }

    if (post_now) {
      const origin = req.headers.get("origin") ?? "";
      await Promise.allSettled(
        post_ids
          .filter((id) => {
            // Don't immediately post story posts — they are scheduled for +1.5h
            return true;
          })
          .map((post_id) =>
            fetch(`${origin}/api/publish/post-now`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ post_id }),
            })
          )
      );
    }

    return NextResponse.json({ success: true, post_ids, media_ids });
  } catch (error) {
    console.error("[schedule]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

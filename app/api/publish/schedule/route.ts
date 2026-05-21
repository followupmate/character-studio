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
    } = body;

    const post_ids: string[] = [];
    const media_ids: string[] = [];

    // Build media records from uploaded files
    const mediaEntries: Array<{ type: "photo" | "video"; path: string }> = [];

    if (file_paths.video) {
      mediaEntries.push({ type: "video", path: file_paths.video });
    }
    if (file_paths.photo1) {
      mediaEntries.push({ type: "photo", path: file_paths.photo1 });
    }
    if (file_paths.photo2) {
      mediaEntries.push({ type: "photo", path: file_paths.photo2 });
    }

    if (mediaEntries.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    for (const { type, path } of mediaEntries) {
      const { data: { publicUrl } } = supabase.storage
        .from("chs-media")
        .getPublicUrl(path);

      // Create media record
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

      // Create post records — one per platform
      for (const platform of platforms) {
        const { data: post, error: postError } = await supabase
          .from("chs_posts")
          .insert({
            media_id: media.id,
            character_id,
            platform,
            scheduled_at: scheduled_at || new Date().toISOString(),
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
      }
    }

    // If post_now, trigger posting for each post
    if (post_now) {
      const origin = req.headers.get("origin") ?? "";
      await Promise.allSettled(
        post_ids.map((post_id) =>
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

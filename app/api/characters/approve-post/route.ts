import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { MediaWithStory } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ApprovePostBody {
  mediaId: string;
}

export async function POST(req: Request) {
  try {
    const { mediaId }: ApprovePostBody = await req.json();

    if (!mediaId) {
      return NextResponse.json({ success: false, error: "mediaId required" }, { status: 400 });
    }

    // Load media with full story + character context
    const { data: mediaData, error } = await supabase
      .from("chs_media")
      .select("*, chs_story_days(*, chs_characters(*))")
      .eq("id", mediaId)
      .single();

    if (error) throw error;
    if (!mediaData) {
      return NextResponse.json({ success: false, error: "Media not found" }, { status: 404 });
    }

    const media = mediaData as MediaWithStory;

    if (media.status !== "ready") {
      return NextResponse.json(
        { success: false, error: `Media status is '${media.status}', expected 'ready'` },
        { status: 422 }
      );
    }

    const day = media.chs_story_days;
    const char = day.chs_characters;

    const caption = [
      day.ig_caption,
      "",
      `📍 ${day.location}`,
      "",
      day.hashtags?.map((h: string) => `#${h}`).join(" ") ?? "",
    ]
      .filter((l) => l !== undefined)
      .join("\n");

    // Post to Instagram
    if (char.platforms.includes("instagram") && media.media_url) {
      const isVideo = media.type === "video";

      const containerBody = new URLSearchParams({
        caption,
        access_token: process.env.IG_ACCESS_TOKEN!,
      });

      if (isVideo) {
        containerBody.append("video_url", media.media_url);
        containerBody.append("media_type", "REELS");
      } else {
        containerBody.append("image_url", media.media_url);
      }

      const containerRes = await fetch(
        `https://graph.instagram.com/v18.0/${process.env.IG_USER_ID}/media`,
        { method: "POST", body: containerBody }
      ).then((r) => r.json());

      if (!containerRes.id) {
        throw new Error(`IG container error: ${JSON.stringify(containerRes)}`);
      }

      if (isVideo) {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }

      await fetch(
        `https://graph.instagram.com/v18.0/${process.env.IG_USER_ID}/media_publish`,
        {
          method: "POST",
          body: new URLSearchParams({
            creation_id: containerRes.id,
            access_token: process.env.IG_ACCESS_TOKEN!,
          }),
        }
      );

      await supabase.from("chs_posts").insert({
        media_id: media.id,
        platform: "instagram",
        posted_at: new Date().toISOString(),
        status: "posted",
      });
    }

    // Mark media as posted
    await supabase.from("chs_media").update({ status: "posted" }).eq("id", media.id);

    return NextResponse.json({ success: true, character: char.name, type: media.type });
  } catch (error) {
    console.error("[approve-post] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

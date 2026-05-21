import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { MediaWithStory } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const today = new Date().toISOString().split("T")[0];

    // Load all ready media for today
    const { data: readyMedia, error } = await supabase
      .from("chs_media")
      .select("*, chs_story_days(*, chs_characters(*))")
      .eq("status", "ready");

    if (error) throw error;

    const results = [];

    for (const media of (readyMedia as MediaWithStory[]) ?? []) {
      const day = media.chs_story_days;
      const char = day.chs_characters;

      // Only post today's content
      if (day.date !== today) continue;

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
        try {
          const isVideo = media.type === "video";

          // Step 1: Create media container
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

          if (!containerRes.id) throw new Error(`IG container error: ${JSON.stringify(containerRes)}`);

          // For videos, wait for processing
          if (isVideo) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
          }

          // Step 2: Publish
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

          results.push({ character: char.name, platform: "instagram", type: media.type, status: "posted" });
        } catch (igError) {
          console.error("[publish] Instagram error:", igError);
          await supabase.from("chs_posts").insert({
            media_id: media.id,
            platform: "instagram",
            status: "failed",
          });
        }
      }

      // Update media status
      await supabase
        .from("chs_media")
        .update({ status: "posted" })
        .eq("id", media.id);
    }

    // Also process publish queue scheduled posts
    const { data: duePosts } = await supabase
      .from("chs_posts")
      .select("id, post_type")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    const appUrl = process.env.APP_URL ?? "https://character-studio-mocha.vercel.app";

    const queueResults = await Promise.allSettled(
      (duePosts ?? []).map(async (post: { id: string; post_type: string | null }) => {
        const isStory = post.post_type === "story";
        const endpoint = isStory
          ? `${appUrl}/api/publish/post-instagram-story`
          : `${appUrl}/api/publish/post-now`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_id: post.id }),
        });
        return res.json();
      })
    );

    return NextResponse.json({
      success: true,
      posted: results,
      queue_processed: queueResults.length,
    });
  } catch (error) {
    console.error("[publish] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

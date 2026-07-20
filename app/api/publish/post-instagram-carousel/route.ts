import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIgAccessToken } from "@/lib/igToken";

export const runtime = "nodejs";
export const maxDuration = 60;

async function pollContainerReady(containerId: string, accessToken: string, isVideo: boolean) {
  const interval = isVideo ? 10000 : 4000;
  const maxAttempts = isVideo ? 4 : 10;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const res = await fetch(
      `https://graph.instagram.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`
    ).then((r) => r.json());
    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR") throw new Error(`IG container ${containerId} processing error`);
  }
  throw new Error(`IG container ${containerId} timed out`);
}

export async function POST(req: Request) {
  let media_ids: string[] | undefined;
  let post_id: string | undefined;
  try {
    const body = await req.json();
    media_ids = body.media_ids as string[];
    post_id = body.post_id as string | undefined;
    const { caption, hashtags, character_id } = body;

    const igUserId = process.env.IG_USER_ID;
    const accessToken = await getIgAccessToken();
    if (!igUserId || !accessToken) throw new Error("IG_USER_ID or IG access token not set");
    if (!media_ids || media_ids.length < 2) throw new Error("Carousel requires at least 2 items");
    if (media_ids.length > 10) throw new Error("Carousel supports max 10 items");

    const fullCaption = [
      caption ?? "",
      "",
      ...(hashtags ?? []).map((h: string) => `#${h}`),
    ]
      .filter((l) => l !== "")
      .join("\n");

    // Step 1: create child containers
    const childIds: string[] = [];
    for (const mediaId of media_ids) {
      const { data: mediaRecord, error: mediaErr } = await supabase
        .from("chs_media")
        .select("media_url, type")
        .eq("id", mediaId)
        .single();
      if (mediaErr || !mediaRecord?.media_url) throw new Error(`Media ${mediaId} not found`);

      const isVideo = mediaRecord.type === "video";
      const params: Record<string, string> = {
        is_carousel_item: "true",
        access_token: accessToken,
      };
      if (isVideo) {
        params.media_type = "VIDEO";
        params.video_url = mediaRecord.media_url;
      } else {
        params.image_url = mediaRecord.media_url;
      }

      const childRes = await fetch(
        `https://graph.instagram.com/v18.0/${igUserId}/media`,
        { method: "POST", body: new URLSearchParams(params) }
      ).then((r) => r.json());
      if (!childRes.id) throw new Error(`IG child container error: ${JSON.stringify(childRes)}`);

      await pollContainerReady(childRes.id, accessToken, isVideo);
      childIds.push(childRes.id);
    }

    // Step 2: carousel container
    const containerRes = await fetch(
      `https://graph.instagram.com/v18.0/${igUserId}/media`,
      {
        method: "POST",
        body: new URLSearchParams({
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption: fullCaption,
          access_token: accessToken,
        }),
      }
    ).then((r) => r.json());
    if (!containerRes.id) throw new Error(`IG carousel container error: ${JSON.stringify(containerRes)}`);

    await pollContainerReady(containerRes.id, accessToken, false);

    // Step 3: publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v18.0/${igUserId}/media_publish`,
      {
        method: "POST",
        body: new URLSearchParams({
          creation_id: containerRes.id,
          access_token: accessToken,
        }),
      }
    ).then((r) => r.json());
    if (!publishRes.id) throw new Error(`IG carousel publish error: ${JSON.stringify(publishRes)}`);

    // Step 4: mark posts as posted
    // New flow: single chs_posts row with media_ids array, identified by post_id
    // Legacy flow: N chs_posts rows (one per media_id), updated by media_id IN media_ids
    if (post_id) {
      await supabase
        .from("chs_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          platform_post_id: publishRes.id,
        })
        .eq("id", post_id);
    } else {
      await supabase
        .from("chs_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          platform_post_id: publishRes.id,
        })
        .in("media_id", media_ids)
        .eq("platform", "instagram");
    }

    return NextResponse.json({ success: true, platform_post_id: publishRes.id });
  } catch (error) {
    console.error("[post-instagram-carousel]", error);
    if (post_id) {
      await supabase.from("chs_posts").update({ status: "failed" }).eq("id", post_id);
    } else if (media_ids?.length) {
      await supabase
        .from("chs_posts")
        .update({ status: "failed" })
        .in("media_id", media_ids)
        .eq("platform", "instagram");
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

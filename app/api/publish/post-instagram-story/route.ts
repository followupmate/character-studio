import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

async function createAndPublishStory(
  igAccountId: string,
  accessToken: string,
  imageUrl: string,
  storyLinkUrl: string | null
): Promise<{ platformPostId?: string; error?: string }> {
  const params: Record<string, string> = {
    image_url: imageUrl,
    media_type: "STORIES",
    access_token: accessToken,
  };

  if (storyLinkUrl) {
    params.links = JSON.stringify([
      {
        type: "SWIPE_UP_LINK",
        url: storyLinkUrl,
        link_title: "Exclusive Content 👀",
      },
    ]);
  }

  const mediaRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media`,
    {
      method: "POST",
      body: new URLSearchParams(params),
    }
  );
  const mediaData = await mediaRes.json();

  if (mediaData.error) {
    // If link sticker fails due to followers requirement, retry without link
    if (
      storyLinkUrl &&
      (mediaData.error.code === 100 || String(mediaData.error.message).includes("link"))
    ) {
      console.warn("[post-instagram-story] Link sticker rejected, retrying without link:", mediaData.error.message);
      return createAndPublishStory(igAccountId, accessToken, imageUrl, null);
    }
    return { error: JSON.stringify(mediaData.error) };
  }

  const creationId = mediaData.id;
  if (!creationId) {
    return { error: "No creation ID returned from IG media endpoint" };
  }

  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }),
    }
  );
  const publishData = await publishRes.json();

  if (publishData.error) {
    return { error: JSON.stringify(publishData.error) };
  }

  if (!publishData.id) {
    return { error: "No platform_post_id returned from IG publish endpoint" };
  }

  return { platformPostId: publishData.id };
}

export async function POST(req: Request) {
  let postId: string | undefined;
  try {
    const body = await req.json();
    postId = body.post_id;

    if (!postId) {
      return NextResponse.json({ error: "post_id is required" }, { status: 400 });
    }

    const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;

    if (!igAccountId || !accessToken) {
      throw new Error("Missing INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN");
    }

    const { data: post, error: postError } = await supabase
      .from("chs_posts")
      .select("*, chs_media(*)")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      throw new Error(`Post not found: ${postId}`);
    }

    const imageUrl = (post as any).chs_media?.media_url;
    if (!imageUrl) {
      await supabase
        .from("chs_posts")
        .update({ status: "failed", ig_caption: (post as any).ig_caption })
        .eq("id", postId);
      throw new Error("media_url is missing for story post");
    }

    const storyLinkUrl: string | null = (post as any).story_link_url ?? null;

    // First attempt
    let result = await createAndPublishStory(igAccountId, accessToken, imageUrl, storyLinkUrl);

    // Retry once after 30s on failure
    if (result.error) {
      console.error(`[post-instagram-story] First attempt failed (post_id=${postId}):`, result.error);
      await new Promise((resolve) => setTimeout(resolve, 30000));
      result = await createAndPublishStory(igAccountId, accessToken, imageUrl, storyLinkUrl);
    }

    if (result.error) {
      console.error(`[post-instagram-story] Retry also failed (post_id=${postId}):`, result.error);
      await supabase
        .from("chs_posts")
        .update({ status: "failed" })
        .eq("id", postId);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    await supabase
      .from("chs_posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        platform_post_id: result.platformPostId,
      })
      .eq("id", postId);

    return NextResponse.json({ success: true, platform_post_id: result.platformPostId });
  } catch (error) {
    console.error(`[post-instagram-story] Error (post_id=${postId}):`, error);
    if (postId) {
      await supabase
        .from("chs_posts")
        .update({ status: "failed" })
        .eq("id", postId);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

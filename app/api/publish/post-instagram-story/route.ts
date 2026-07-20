import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIgAccessToken } from "@/lib/igToken";

export const runtime = "nodejs";
export const maxDuration = 60;

// Wait until the IG media container finishes processing before publishing. Skipping this is what
// causes error 2207027 "Media ID is not available" — the carousel route already does this; stories must too.
async function pollContainerReady(containerId: string, accessToken: string) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(
      `https://graph.instagram.com/v18.0/${containerId}?fields=status_code&access_token=${accessToken}`
    ).then((r) => r.json());
    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR") throw new Error(`IG container ${containerId} processing error`);
  }
  throw new Error(`IG container ${containerId} timed out`);
}

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
    `https://graph.instagram.com/v18.0/${igAccountId}/media`,
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

  // Wait for the container to finish processing (fixes 2207027 "Media ID is not available").
  try {
    await pollContainerReady(creationId, accessToken);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const publishRes = await fetch(
    `https://graph.instagram.com/v18.0/${igAccountId}/media_publish`,
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

    const igAccountId = process.env.IG_USER_ID;
    const accessToken = await getIgAccessToken();

    if (!igAccountId || !accessToken) {
      throw new Error("Missing IG_USER_ID or IG_ACCESS_TOKEN");
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

    // Retry once immediately (no sleep — Hobby plan 60s limit)
    if (result.error) {
      console.error(`[post-instagram-story] First attempt failed (post_id=${postId}):`, result.error);
      result = await createAndPublishStory(igAccountId, accessToken, imageUrl, storyLinkUrl);
    }

    if (result.error) {
      console.error(`[post-instagram-story] Retry also failed (post_id=${postId}):`, result.error);
      await supabase
        .from("chs_posts")
        .update({ status: "failed", last_error: result.error.slice(0, 500) })
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
    const msg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (postId) {
      await supabase.from("chs_posts").update({ status: "failed", last_error: msg }).eq("id", postId);
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getYouTubeAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`YouTube token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function postToInstagram(
  mediaUrl: string,
  caption: string,
  isVideo: boolean
): Promise<string> {
  const igUserId = process.env.IG_USER_ID;
  const accessToken = process.env.IG_ACCESS_TOKEN;

  const params = new URLSearchParams({ caption, access_token: accessToken! });
  if (isVideo) {
    params.append("video_url", mediaUrl);
    params.append("media_type", "REELS");
    params.append("share_to_feed", "true");
  } else {
    params.append("image_url", mediaUrl);
  }

  const containerRes = await fetch(
    `https://graph.instagram.com/v18.0/${igUserId}/media`,
    { method: "POST", body: params }
  ).then((r) => r.json());

  if (!containerRes.id) {
    throw new Error(`IG container error: ${JSON.stringify(containerRes)}`);
  }

  // Poll until container is FINISHED (photos: fast ~5s, videos: up to 5 min)
  const pollInterval = isVideo ? 30000 : 4000;
  const pollMax = isVideo ? 10 : 15;
  let finished = false;
  for (let i = 0; i < pollMax; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusRes = await fetch(
      `https://graph.instagram.com/v18.0/${containerRes.id}?fields=status_code,status&access_token=${accessToken}`
    ).then((r) => r.json());
    if (statusRes.status_code === "FINISHED") { finished = true; break; }
    if (statusRes.status_code === "ERROR") throw new Error(`IG container processing failed: ${statusRes.status ?? "no detail"}`);
  }
  if (!finished) throw new Error(isVideo ? "IG video processing timed out (5 min)" : "IG photo processing timed out (60s)");

  const publishRes = await fetch(
    `https://graph.instagram.com/v18.0/${igUserId}/media_publish`,
    {
      method: "POST",
      body: new URLSearchParams({
        creation_id: containerRes.id,
        access_token: accessToken!,
      }),
    }
  ).then((r) => r.json());

  if (!publishRes.id) throw new Error(`IG publish error: ${JSON.stringify(publishRes)}`);
  return publishRes.id;
}

async function postToYouTube(
  videoUrl: string,
  ytTitle: string,
  ytDescription: string,
  scheduledAt?: string | null
): Promise<string> {
  const accessToken = await getYouTubeAccessToken();

  // Fetch video metadata (HEAD) to get content-length without downloading body yet
  const headRes = await fetch(videoUrl, { method: "HEAD" });
  if (!headRes.ok) throw new Error(`Failed to HEAD video: ${headRes.status}`);
  const contentLength = headRes.headers.get("content-length");
  if (!contentLength || contentLength === "0") throw new Error(`Missing content-length for video: ${videoUrl}`);

  const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
  const status = isScheduled
    ? { privacyStatus: "private", publishAt: scheduledAt }
    : { privacyStatus: "public" };

  // Initiate resumable upload
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": contentLength,
      },
      body: JSON.stringify({
        snippet: {
          title: ytTitle || "New Video",
          description: ytDescription || "",
          categoryId: "22",
        },
        status,
      }),
    }
  );

  if (!initRes.ok) {
    const initErr = await initRes.text();
    throw new Error(`YouTube init failed ${initRes.status}: ${initErr}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("No upload URL from YouTube");

  // Fetch video body and stream to YouTube
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status}`);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": contentLength,
    },
    body: videoRes.body,
    // @ts-expect-error — duplex required for streaming body in Node 18+
    duplex: "half",
  });

  const ytData = await uploadRes.json();
  console.log("[post-now] YT upload response:", JSON.stringify(ytData).slice(0, 300));
  if (!uploadRes.ok || !ytData.id) throw new Error(`YouTube upload failed: ${JSON.stringify(ytData)}`);
  return ytData.id;
}

export async function POST(req: Request) {
  const { post_id } = await req.json();

  try {
    const { data: post, error } = await supabase
      .from("chs_posts")
      .select("*, chs_media(type, media_url)")
      .eq("id", post_id)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const media = post.chs_media as { type: string; media_url: string | null } | null;
    if (!media?.media_url) {
      throw new Error("No media URL available");
    }

    let platformPostId = "";

    if (post.platform === "instagram") {
      const caption = [
        post.ig_caption ?? "",
        "",
        (post.hashtags ?? []).map((h: string) => `#${h}`).join(" "),
      ]
        .filter((l) => l !== "")
        .join("\n");

      platformPostId = await postToInstagram(
        media.media_url,
        caption,
        media.type === "video"
      );
    } else if (post.platform === "youtube") {
      if (media.type !== "video") throw new Error("YouTube requires video");
      platformPostId = await postToYouTube(
        media.media_url,
        post.yt_title ?? "",
        post.yt_description ?? "",
        post.scheduled_at
      );
    }

    await supabase
      .from("chs_posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        platform_post_id: platformPostId,
      })
      .eq("id", post_id);

    return NextResponse.json({ success: true, platform_post_id: platformPostId });
  } catch (error) {
    console.error("[post-now]", error);

    const msg = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    await supabase
      .from("chs_posts")
      .update({ status: "failed", last_error: msg })
      .eq("id", post_id);

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// YouTube Data API helpers shared by /api/publish/post-now (upload) and
// /api/publish/import-youtube-stats (read-back of public statistics).

export async function getYouTubeAccessToken(): Promise<string> {
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

// Custom thumbnail for a long-form video (thumbnails.set). Requires a phone-verified channel.
// Shorts don't use custom thumbnails in the feed, so callers only use this for post_type "longform".
export async function setYouTubeThumbnail(videoId: string, imageUrl: string, accessToken: string): Promise<void> {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`thumbnail fetch ${img.status}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024) throw new Error(`thumbnail ${bytes.length} B > 2 MB YouTube limit`);
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": img.headers.get("content-type") || "image/jpeg" },
      body: bytes,
    }
  );
  if (!res.ok) throw new Error(`thumbnails.set ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export interface YouTubeVideoStats {
  id: string;
  views: number;
  likes: number;
  comments: number;
  privacyStatus: string | null;
  title: string | null;
}

// videos.list?part=statistics,status,snippet for up to 50 ids per call.
// Uses 1 quota unit per call regardless of id count.
export async function fetchYouTubeStats(ids: string[], accessToken: string): Promise<YouTubeVideoStats[]> {
  const out: YouTubeVideoStats[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,status,snippet&id=${chunk.join(",")}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(`YouTube videos.list ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    for (const v of data.items ?? []) {
      out.push({
        id: v.id,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        privacyStatus: v.status?.privacyStatus ?? null,
        title: v.snippet?.title ?? null,
      });
    }
  }
  return out;
}

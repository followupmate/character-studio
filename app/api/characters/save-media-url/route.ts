import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface SaveMediaUrlBody {
  mediaId: string;
  url: string;
}

export async function POST(req: Request) {
  try {
    const { mediaId, url }: SaveMediaUrlBody = await req.json();

    if (!mediaId || !url?.trim()) {
      return NextResponse.json(
        { success: false, error: "mediaId and url are required" },
        { status: 400 }
      );
    }

    const sourceUrl = url.trim();

    // Download the media from the provided URL
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("video") ? "mp4" : "jpg";
    const fileName = `${mediaId}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("character-media")
      .upload(fileName, Buffer.from(buffer), {
        contentType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Get the permanent public URL
    const { data: { publicUrl } } = supabase.storage
      .from("character-media")
      .getPublicUrl(fileName);

    // Save permanent public URL + original source URL
    const { error: dbError } = await supabase
      .from("chs_media")
      .update({
        media_url: publicUrl,
        source_url: sourceUrl,
        status: "ready",
      })
      .eq("id", mediaId);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, publicUrl });
  } catch (error) {
    console.error("[save-media-url] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

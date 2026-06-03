import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { mediaId, url } = await req.json();

    if (!mediaId || !url?.trim()) {
      return NextResponse.json(
        { error: "mediaId and url are required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("chs_media")
      .update({
        media_url: url.trim(),
        source_url: url.trim(),
        status: "ready",
      })
      .eq("id", mediaId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[save-media-url]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

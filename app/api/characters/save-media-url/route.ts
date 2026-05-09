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

    const { error } = await supabase
      .from("chs_media")
      .update({ media_url: url.trim(), status: "ready" })
      .eq("id", mediaId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[save-media-url] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

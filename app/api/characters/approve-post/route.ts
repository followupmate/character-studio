import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  const { mediaId } = await req.json();

  await supabase.from("chs_media").update({ status: "posted" }).eq("id", mediaId);
  await supabase.from("chs_posts").insert({
    media_id: mediaId,
    platform: "instagram",
    posted_at: new Date().toISOString(),
    status: "posted",
  });

  return NextResponse.json({ success: true });
}

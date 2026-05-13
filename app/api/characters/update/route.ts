import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  try {
    const { characterId, photo_url, visual_tone } = await req.json();
    if (!characterId) {
      return NextResponse.json({ error: "Missing characterId" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (photo_url !== undefined) patch.photo_url = photo_url;
    if (visual_tone !== undefined) patch.visual_tone = visual_tone;

    const { error } = await supabase
      .from("chs_characters")
      .update(patch)
      .eq("id", characterId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  try {
    const { characterId, photo_url, visual_tone, prompt_doctrine, styling_note, fanvue_link, feature_flag } = await req.json();
    if (!characterId) {
      return NextResponse.json({ error: "Missing characterId" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (photo_url !== undefined) patch.photo_url = photo_url;
    if (visual_tone !== undefined) patch.visual_tone = visual_tone;
    if (prompt_doctrine !== undefined) patch.prompt_doctrine = prompt_doctrine;
    if (styling_note !== undefined) patch.styling_note = styling_note;
    if (fanvue_link !== undefined) patch.fanvue_link = fanvue_link;

    // feature_flag: { flag: string, value: boolean } — merged into the jsonb
    // feature_flags column (read-modify-write to preserve the other flags).
    if (feature_flag?.flag) {
      const { data: current } = await supabase
        .from("chs_characters")
        .select("feature_flags")
        .eq("id", characterId)
        .single();
      const flags = { ...(current?.feature_flags as Record<string, unknown> ?? {}) };
      flags[feature_flag.flag] = feature_flag.value === true;
      patch.feature_flags = flags;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

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

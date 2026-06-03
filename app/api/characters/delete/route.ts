import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(req: NextRequest) {
  try {
    const { characterId } = await req.json();
    if (!characterId) {
      return NextResponse.json({ error: "Missing characterId" }, { status: 400 });
    }

    // Delete media records linked to this character's story days
    const { data: storyDays } = await supabase
      .from("chs_story_days")
      .select("id")
      .eq("character_id", characterId);

    if (storyDays && storyDays.length > 0) {
      const storyDayIds = storyDays.map((s) => s.id);
      const { data: mediaItems } = await supabase
        .from("chs_media")
        .select("id")
        .in("story_day_id", storyDayIds);

      if (mediaItems && mediaItems.length > 0) {
        const mediaIds = mediaItems.map((m) => m.id);
        await supabase.from("chs_posts").delete().in("media_id", mediaIds);
        await supabase.from("chs_media").delete().in("story_day_id", storyDayIds);
      }

      await supabase.from("chs_story_days").delete().eq("character_id", characterId);
    }

    const { error } = await supabase
      .from("chs_characters")
      .delete()
      .eq("id", characterId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

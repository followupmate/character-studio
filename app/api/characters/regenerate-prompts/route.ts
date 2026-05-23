import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDailyBatch } from "@/lib/dailyBatch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: storyDays, error } = await supabase
      .from("chs_story_days")
      .select("id, character_id, chs_characters(name)")
      .eq("date", today);

    if (error) throw error;
    if (!storyDays || storyDays.length === 0) {
      return NextResponse.json({ success: false, error: "No stories found for today" }, { status: 404 });
    }

    const results = await Promise.allSettled(
      storyDays.map((day) =>
        generateDailyBatch({
          characterId: day.character_id,
          storyDayId: day.id,
          forceRegenerate: true,
        })
      )
    );

    const summary = results.map((r, i) => {
      const charName = (storyDays[i].chs_characters as unknown as { name?: string })?.name ?? storyDays[i].character_id;
      if (r.status === "rejected") {
        return { character: charName, status: "rejected", error: String(r.reason) };
      }
      return {
        character: charName,
        status: r.value.status,
        slotsGenerated: r.value.generated.filter((g) => g.ok).length,
        slotsFailed: r.value.generated.filter((g) => !g.ok).length,
      };
    });

    const allOk = results.every(
      (r) => r.status === "fulfilled" && r.value.status === "ready"
    );
    return NextResponse.json({ success: allOk, regenerated: summary });
  } catch (err) {
    console.error("[regenerate-prompts]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

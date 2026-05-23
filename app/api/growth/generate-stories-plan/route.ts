import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { character_id, story_day_id, has_reel } = await req.json();

    if (!character_id) {
      return NextResponse.json({ error: "character_id required" }, { status: 400 });
    }

    const { data: char } = await supabase
      .from("chs_characters")
      .select("name")
      .eq("id", character_id)
      .single();

    if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    let narrative = "";
    let location = "";
    let mood = "";

    if (story_day_id) {
      const { data: day } = await supabase
        .from("chs_story_days")
        .select("narrative, location, mood")
        .eq("id", story_day_id)
        .single();
      if (day) {
        narrative = day.narrative;
        location = day.location;
        mood = day.mood;
      }
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: `Create a daily Stories plan (3-5 stories) for this cinematic creator.

Character: ${char.name}
Today's story: ${narrative || "no specific story context"}
Location: ${location || "unspecified"}
Mood: ${mood || "aesthetic, soft"}
Has reel today: ${has_reel ? "yes — include repost as first story" : "no"}

Stories should be:
- Retention engine, not broadcast
- Mix: aesthetic moments + BTS + repost
- NOT more than 5

Return ONLY a JSON array:
[
  { "type": "repost_reel", "description": "repost dnešného reelu", "text_overlay": null, "order": 1 },
  { "type": "aesthetic", "description": "coffee on marble table, golden light", "text_overlay": "slow mornings ✦", "order": 2 },
  { "type": "bts", "description": "editing session, laptop glow", "text_overlay": null, "order": 3 }
]

Types: repost_reel | aesthetic | bts | poll | quote`,
      messages: [{ role: "user", content: "Generate the stories plan." }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");
    const plan = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("[generate-stories-plan]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

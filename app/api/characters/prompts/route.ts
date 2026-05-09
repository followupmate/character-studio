import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { storyDayId } = await req.json();

    // Load story day + character
    const { data: day, error } = await supabase
      .from("chs_story_days")
      .select("*, chs_characters(*)")
      .eq("id", storyDayId)
      .single();

    if (error || !day) throw error ?? new Error("Story day not found");

    const char = day.chs_characters;

    // Generate PHOTO prompt (Seedance 2.0 + Soul ID)
    const photoMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      system: `Generate a Higgsfield Seedance 2.0 photo prompt for ${char.name}.

${char.soul_id ? `Soul ID: ${char.soul_id}` : `Visual brief (no Soul ID yet): ${char.visual_brief}`}

Format — use exactly these section headers:
COMPOSITION
SUBJECT
CAMERA
MOOD

Rules:
- Photorealistic. Editorial quality. No AI aesthetic.
- Subject feels caught in a real moment, not posed.
- Shallow depth of field. Natural light preferred.
- Think: iPhone photo by a great photographer, not a studio shoot.`,
      messages: [
        {
          role: "user",
          content: `Location: ${day.location}
Mood: ${day.mood}
Story: ${day.narrative}

Generate photo prompt.`,
        },
      ],
    });

    // Generate VIDEO prompt (Cinema Studio 3.5)
    const videoMsg = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      system: `Generate a Higgsfield Cinema Studio 3.5 video prompt.

Format — use exactly these section headers:
COMPOSITION
SUBJECT
CAMERA
MOOD

Rules:
- 9:16 portrait format, 8-15 seconds
- Slice of life aesthetic — no dramatic cinematography
- Focus on: hands, environment, movement, textures, atmosphere
- No direct face shots required — intimacy over visibility
- Think: ASMR-adjacent, contemplative, morning ritual energy
- Slow motion feel. Let the subject breathe.`,
      messages: [
        {
          role: "user",
          content: `Location: ${day.location}
Mood: ${day.mood}
Story: ${day.narrative}

Generate video prompt.`,
        },
      ],
    });

    const photoPrompt = (photoMsg.content[0] as { type: string; text: string }).text;
    const videoPrompt = (videoMsg.content[0] as { type: string; text: string }).text;

    // Save both prompts to DB
    const mediaItems = [
      { type: "photo", prompt: photoPrompt },
      { type: "video", prompt: videoPrompt },
    ];

    for (const item of mediaItems) {
      await supabase.from("chs_media").insert({
        story_day_id: storyDayId,
        type: item.type,
        higgsfield_prompt: item.prompt,
        status: "pending",
      });
    }

    // TODO: When Higgsfield API is available, trigger generation here:
    // const photoJob = await higgsfieldClient.generate({ soul_id: char.soul_id, prompt: photoPrompt, type: 'photo' })
    // await supabase.from('chs_media').update({ higgsfield_job_id: photoJob.id, status: 'generating' }).eq(...)

    return NextResponse.json({
      success: true,
      character: char.name,
      prompts: { photo: photoPrompt, video: videoPrompt },
    });
  } catch (error) {
    console.error("[prompts] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

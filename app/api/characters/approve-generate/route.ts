import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

interface ApproveGenerateBody {
  storyDayId: string;
}

export async function POST(req: Request) {
  try {
    const { storyDayId }: ApproveGenerateBody = await req.json();

    if (!storyDayId) {
      return NextResponse.json({ success: false, error: "storyDayId required" }, { status: 400 });
    }

    // Load pending media with soul_id from character
    const { data: mediaRecords, error } = await supabase
      .from("chs_media")
      .select("id, higgsfield_prompt, type, chs_story_days(chs_characters(soul_id))")
      .eq("story_day_id", storyDayId)
      .eq("status", "pending");

    if (error) throw error;
    if (!mediaRecords || mediaRecords.length === 0) {
      return NextResponse.json({ success: false, error: "No pending media for this story day" }, { status: 404 });
    }

    const owner = process.env.GITHUB_OWNER!;
    const repo = process.env.GITHUB_REPO!;
    const token = process.env.GH_TOKEN!;

    const dispatched = [];

    for (const media of mediaRecords) {
      const soulId =
        (media as unknown as { chs_story_days: { chs_characters: { soul_id: string | null } } })
          .chs_story_days?.chs_characters?.soul_id ?? "";

      // Trigger GitHub Actions workflow
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/higgsfield.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              media_id: media.id,
              prompt: media.higgsfield_prompt,
              type: media.type,
              soul_id: soulId,
            },
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub dispatch failed for media ${media.id}: ${res.status} ${body}`);
      }

      dispatched.push(media.id);
    }

    // Mark all as generating
    const { error: updateError } = await supabase
      .from("chs_media")
      .update({ status: "generating" })
      .in("id", dispatched);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, dispatched });
  } catch (error) {
    console.error("[approve-generate] Error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

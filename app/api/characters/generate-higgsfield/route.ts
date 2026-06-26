import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Triggers the existing GitHub Actions workflow (.github/workflows/higgsfield.yml) which runs the
// Higgsfield CLI (text2image_soul_v2 for photo / cinematic_studio_3_0 for video) using HIGGSFIELD_TOKEN,
// then PATCHes chs_media (media_url + status) when done. This is the in-app "Higgsfield Soul" button —
// best face + environment fidelity, generated async via GitHub Actions.
//
// Required env: GITHUB_OWNER, GITHUB_REPO, GH_TOKEN (all already configured on the project).

const WORKFLOW_FILE = "higgsfield.yml";
// Validated Vivienne Higgsfield Soul ID — fallback when the character row has no soul_id.
const FALLBACK_SOUL_ID = "fb42bf59-4397-4ac9-bf60-37af3e55a308";

export async function POST(req: Request) {
  try {
    const { mediaId, promptOverride } = (await req.json()) as {
      mediaId?: string;
      promptOverride?: string;
    };
    if (!mediaId) {
      return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
    }

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const token = process.env.GH_TOKEN;
    if (!owner || !repo || !token) {
      return NextResponse.json(
        { error: "Higgsfield not configured (missing GITHUB_OWNER / GITHUB_REPO / GH_TOKEN)" },
        { status: 500 }
      );
    }

    const { data: media, error: mErr } = await supabase
      .from("chs_media")
      .select("id, type, higgsfield_prompt, batch_id")
      .eq("id", mediaId)
      .single();
    if (mErr || !media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    // Resolve the character's Soul ID via batch → daily_plan → character.
    let soulId = FALLBACK_SOUL_ID;
    const { data: plan } = await supabase
      .from("chs_daily_plans")
      .select("character_id")
      .eq("id", media.batch_id)
      .single();
    if (plan?.character_id) {
      const { data: character } = await supabase
        .from("chs_characters")
        .select("soul_id")
        .eq("id", plan.character_id)
        .single();
      if (character?.soul_id) soulId = character.soul_id;
    }

    const prompt = (promptOverride?.trim() || media.higgsfield_prompt || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "No prompt available for this media" }, { status: 422 });
    }

    // Persist override + mark generating (workflow will flip to ready/failed when done).
    const update: Record<string, string> = { generation_status: "generating" };
    if (promptOverride?.trim() && promptOverride.trim() !== media.higgsfield_prompt) {
      update.higgsfield_prompt = promptOverride.trim();
    }
    await supabase.from("chs_media").update(update).eq("id", mediaId);

    // Dispatch the workflow.
    const ghRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "character-studio",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            media_id: mediaId,
            prompt,
            type: media.type === "video" ? "video" : "photo",
            soul_id: soulId,
          },
        }),
      }
    );

    if (ghRes.status !== 204) {
      const detail = await ghRes.text();
      await supabase
        .from("chs_media")
        .update({ generation_status: "failed", last_error: `GitHub dispatch ${ghRes.status}: ${detail.slice(0, 300)}` })
        .eq("id", mediaId);
      return NextResponse.json(
        { success: false, error: `GitHub workflow dispatch failed (${ghRes.status})`, detail: detail.slice(0, 300) },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Higgsfield generation started via GitHub Actions — media will update to ready when done (~1-3 min).",
      mediaId,
      soulId,
    });
  } catch (error) {
    console.error("[generate-higgsfield]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

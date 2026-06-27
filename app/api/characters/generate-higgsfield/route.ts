import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Triggers the existing GitHub Actions workflow (.github/workflows/higgsfield.yml) which runs the
// Higgsfield CLI (soul_2 + soul_id for photo / cinematic_studio_3_0 for video) using HIGGSFIELD_TOKEN,
// downloads the result to Supabase Storage, then PATCHes chs_media (media_url + status) when done.
// This is the in-app "Higgsfield Soul" button — best face fidelity for max-intimate scenes, async.
//
// Required env: GITHUB_OWNER, GITHUB_REPO, GH_TOKEN (all already configured on the project).

const WORKFLOW_FILE = "higgsfield.yml";
// Validated Vivienne Higgsfield Soul ID — fallback when the character row has no soul_id.
const FALLBACK_SOUL_ID = "fb42bf59-4397-4ac9-bf60-37af3e55a308";

// Lightweight poll for the async GH-Actions flow: the client dispatches via POST, then polls GET
// until the workflow flips the row to ready (media_url set) or failed.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { data, error } = await supabase
    .from("chs_media")
    .select("generation_status, status, media_url, last_error")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  return NextResponse.json(data);
}

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

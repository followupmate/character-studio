import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

// In-app Higgsfield Soul image generation — calls the official Higgsfield Cloud API
// (platform.higgsfield.ai) directly from the server. Used for max-intimate scenes where Soul gives the
// most faithful, realistic face. The trained Vivienne Soul is referenced by `custom_reference_id`.
// The result is downloaded into Supabase Storage so the asset lives on our CDN like everything else.
//
// Required env: HIGGSFIELD_API_KEY in "KEY_ID:KEY_SECRET" format (from cloud.higgsfield.ai → API keys).
//
// MODEL CHOICE: we use the v2 gateway model `higgsfield-ai/soul/standard` (direct JSON body, polled via
// status_url). The legacy `/v1/text2image/soul` endpoint produced plasticky skin; the v2 gateway model
// gives realistic skin texture (visible pores/freckles) matching the consumer app's Soul 2.0 quality.
//
// NOTE: the previous GitHub-Actions + CLI path was abandoned — the Higgsfield CLI only supports
// interactive browser device-login, so it cannot authenticate in CI (it hangs). And the consumer-app
// soul (fb42bf59...) is NOT usable here — the Cloud API has a separate scope; we trained 44d9ecae via it.

const BASE = "https://platform.higgsfield.ai";
// `character` mode locks the trained-character identity hardest (we always pass a trained soul);
// `standard` is more prompt-flexible. Both give realistic Soul-V2 skin. Resolution caps at 1080p on the
// Cloud API (no native 2K / no upscale endpoint).
const SOUL_MODEL = "higgsfield-ai/soul/character";
// Vivienne's Cloud-API-scoped Soul ID (trained via /v1/custom-references) — fallback when the
// character row has no soul_id.
const FALLBACK_SOUL_ID = "44d9ecae-4be5-4fc4-8ad2-ca7f91244108";

// Soul supports 9:16, 3:4, 1:1 etc. (not 4:5). Map our slots to the closest supported ratio.
function aspectFor(channel: string | null | undefined): string {
  if (channel === "feed") return "3:4"; // closest to the 4:5 feed carousel
  return "9:16"; // reel / story / default
}

function cleanPrompt(raw: string): string {
  return raw
    .replace(/^Model:\s*Soul\s*\d+\s*[^\n]*?(Image\s*Prompt)?[\s:]*/i, "")
    .replace(/^Image\s*Prompt[\s:]*/i, "")
    .replace(/^[\s🖤🖼️]+/, "")
    .trim();
}

// Lightweight poll for the (older) async flow / status checks.
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
  let mediaId: string | undefined;
  try {
    const body = (await req.json()) as { mediaId?: string; promptOverride?: string };
    mediaId = body.mediaId;
    const promptOverride = body.promptOverride;
    if (!mediaId) {
      return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
    }

    const credentials = process.env.HIGGSFIELD_API_KEY;
    if (!credentials || !credentials.includes(":")) {
      return NextResponse.json(
        { error: "Higgsfield not configured — set HIGGSFIELD_API_KEY env to \"KEY_ID:KEY_SECRET\" (from cloud.higgsfield.ai)" },
        { status: 500 }
      );
    }

    const { data: media, error: mErr } = await supabase
      .from("chs_media")
      .select("id, type, channel, higgsfield_prompt, batch_id")
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

    const prompt = cleanPrompt((promptOverride?.trim() || media.higgsfield_prompt || "").trim());
    if (!prompt) {
      return NextResponse.json({ error: "No prompt available for this media" }, { status: 422 });
    }

    // Persist override + mark generating.
    const update: Record<string, string> = { generation_status: "generating", last_error: "" };
    if (promptOverride?.trim() && promptOverride.trim() !== media.higgsfield_prompt) {
      update.higgsfield_prompt = promptOverride.trim();
    }
    await supabase.from("chs_media").update(update).eq("id", mediaId);

    // Generate via the v2 gateway Soul model (direct JSON body, Authorization: Key, poll status_url).
    const auth = `Key ${credentials}`;
    const submit = await fetch(`${BASE}/${SOUL_MODEL}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectFor(media.channel),
        resolution: "1080p",
        custom_reference_id: soulId,
      }),
    });
    let job = (await submit.json().catch(() => ({}))) as {
      status?: string;
      status_url?: string;
      images?: Array<{ url?: string }>;
      detail?: string;
    };
    if (!submit.ok) {
      throw new Error(`Higgsfield submit ${submit.status}: ${job.detail ?? JSON.stringify(job).slice(0, 200)}`);
    }

    // Poll status_url until the job finishes.
    for (let i = 0; i < 45 && job.status !== "completed" && job.status !== "failed" && job.status !== "nsfw"; i++) {
      if (!job.status_url) break;
      await new Promise((r) => setTimeout(r, 2500));
      const pr = await fetch(job.status_url, { headers: { Authorization: auth } });
      job = await pr.json();
    }

    if (job.status === "nsfw") throw new Error("Higgsfield flagged the prompt as NSFW — soften the wording.");
    const srcUrl = job.images?.[0]?.url;
    if (!srcUrl) throw new Error(`Higgsfield returned no image (status: ${job.status ?? "unknown"})`);

    // Download + upload to Supabase Storage so the asset lives on our CDN.
    const img = await fetch(srcUrl);
    if (!img.ok) throw new Error(`download failed ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    const storagePath = `media/${mediaId}.png`;
    const { error: upErr } = await supabase.storage
      .from("character-media")
      .upload(storagePath, buf, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
    const { data: pub } = supabase.storage.from("character-media").getPublicUrl(storagePath);
    const finalUrl = `${pub.publicUrl}?t=${Date.now()}`;

    await supabase
      .from("chs_media")
      .update({ media_url: finalUrl, source_url: finalUrl, generation_status: "completed", status: "ready", last_error: null })
      .eq("id", mediaId);

    return NextResponse.json({ success: true, mediaId, media_url: finalUrl, soulId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[generate-higgsfield]", msg);
    if (mediaId) {
      await supabase
        .from("chs_media")
        .update({ generation_status: "failed", status: "failed", last_error: msg.slice(0, 400) })
        .eq("id", mediaId);
    }
    return NextResponse.json({ success: false, error: msg.slice(0, 400) }, { status: 500 });
  }
}

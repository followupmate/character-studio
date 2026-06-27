import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { HiggsfieldClient } from "@higgsfield/client";

export const runtime = "nodejs";
export const maxDuration = 120;

// In-app Higgsfield Soul image generation — calls the official Higgsfield Cloud API
// (platform.higgsfield.ai) directly from the server via the official SDK. Used for max-intimate
// scenes where Soul 2.0 gives the most faithful face. The trained Vivienne Soul is referenced by
// `custom_reference_id` (= the soul_id). The result is downloaded into Supabase Storage so the asset
// lives on our CDN like everything else.
//
// Required env: HIGGSFIELD_API_KEY in "KEY_ID:KEY_SECRET" format (from cloud.higgsfield.ai → API keys).
//
// NOTE: the previous GitHub-Actions + CLI path was abandoned — the Higgsfield CLI only supports
// interactive browser device-login, so it cannot authenticate in CI (it hangs).

const SOUL_ENDPOINT = "/v1/text2image/soul";
// Vivienne's Cloud-API-scoped Soul ID (trained via /v1/custom-references) — fallback when the
// character row has no soul_id. NOTE: the consumer-app soul (fb42bf59...) is NOT usable here — the
// Cloud API has a separate scope and only sees souls trained through it.
const FALLBACK_SOUL_ID = "44d9ecae-4be5-4fc4-8ad2-ca7f91244108";

// Soul 2.0 supports 9:16, 3:4, 1:1 etc. (not 4:5). Map our slots to the closest portrait size.
// 9:16 = 1152x2048 is confirmed (the value the backend produces for aspect_ratio 9:16).
function dimsFor(channel: string | null | undefined): string {
  if (channel === "feed") return "1536x2048"; // 3:4 — closest portrait to the 4:5 feed carousel
  return "1152x2048"; // 9:16 — reel / story / default
}

function cleanPrompt(raw: string): string {
  return raw
    .replace(/^Model:\s*Soul\s*\d+\s*[^\n]*?(Image\s*Prompt)?[\s:]*/i, "")
    .replace(/^Image\s*Prompt[\s:]*/i, "")
    .replace(/^[\s🖤🖼️]+/, "")
    .trim();
}

// Pull the result image URL out of whatever shape the SDK returns (v2 JobSet or V2Response).
function extractUrl(jobSet: unknown): string | null {
  const j = jobSet as {
    jobs?: Array<{ results?: { raw?: { url?: string }; min?: { url?: string } } }>;
    images?: Array<{ url?: string }>;
    results?: { rawUrl?: string; raw?: { url?: string } };
  };
  return (
    j?.jobs?.[0]?.results?.raw?.url ??
    j?.images?.[0]?.url ??
    j?.results?.raw?.url ??
    j?.results?.rawUrl ??
    null
  );
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

    // Generate via the official SDK v1 client (blocks until the job completes, ~30-40s).
    // The soul endpoint expects the body wrapped as { params: {...} } — the v1 `generate()` does exactly
    // that (v2 `subscribe()` sends input un-wrapped, which the soul endpoint rejects with "body.params required").
    const colon = credentials.indexOf(":");
    const apiKey = credentials.slice(0, colon);
    const apiSecret = credentials.slice(colon + 1);
    // v1 client wraps the body as { params: {...} } (which /v1/text2image/soul requires) via hf-api-key/
    // hf-secret headers; we also pass the documented `Authorization: Key id:secret` header (confirmed
    // accepted by the endpoint) so whichever the platform expects is present.
    const client = new HiggsfieldClient({
      apiKey,
      apiSecret,
      headers: { Authorization: `Key ${apiKey}:${apiSecret}` },
    });
    const jobSet = await client.generate(
      SOUL_ENDPOINT,
      {
        prompt,
        width_and_height: dimsFor(media.channel),
        quality: "1080p",
        batch_size: 1,
        custom_reference_id: soulId,
      },
      { withPolling: true }
    );

    const srcUrl = extractUrl(jobSet);
    if (!srcUrl) {
      throw new Error(`Higgsfield returned no image (status: ${(jobSet as { status?: string })?.status ?? "unknown"})`);
    }

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

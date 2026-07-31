import { fal } from "@fal-ai/client";
import { supabase } from "@/lib/supabase";

// Kling (image-to-video) via fal.ai — the app's established, working video path (see
// app/api/characters/video-async/route.ts, where "kling" is already the default model). Used here
// as the actual provider behind lib/seedancePromptCompiler.ts's compiled prompts: the documented
// Higgsfield Seedance REST endpoint (bytedance/seedance/v1/pro/image-to-video) returned a real 404
// "model_not_found" on a live call — the account's current model catalog only exposes
// seedance_2_0/1_5/2_0_mini, and the public docs are stale for the v1/pro path. Rather than guess
// at an unverified replacement endpoint, this reuses the proven Kling pattern instead.
// lib/seedancePromptCompiler.ts's output is provider-agnostic prose and works fine as a Kling
// motion prompt too (confirmed via real test + production generations).

export function klingConfigured(): boolean {
  return !!process.env.FAL_API_KEY;
}

export type KlingTier = "standard" | "pro";

// v3 (verified this session against the real @fal-ai/client generated types AND a real paid test
// call): genuinely newer model than v2.1/v1.6, and the ONLY version that exposes end_image_url —
// tested on two real production images (the same day's bridge/payoff shots, both already sharing
// lib/shotDirection.ts's environment anchor) and confirmed the resulting video holds that same
// environment continuously, not just at the two bookend frames. v3's standard/pro input types are
// identical (KlingVideoV3StandardImageToVideoInput is a straight alias of the Pro type).
const KLING_MODEL: Record<KlingTier, string> = {
  standard: "fal-ai/kling-video/v3/standard/image-to-video",
  pro: "fal-ai/kling-video/v3/pro/image-to-video",
};

// Verified against the real @fal-ai/client generated types (node_modules/@fal-ai/client/src/types/
// endpoints.d.ts, KlingVideoV3ProImageToVideoInput) rather than guessed from docs — every Kling
// image-to-video variant exposes negative_prompt (default "blur, distort, and low quality") and
// cfg_scale (default 0.5, higher = follows the text prompt more literally). Kling's own prompting
// guide recommends a real negative_prompt field for exactly this — distinct from embedding negated
// instructions in the descriptive prompt text itself, which this session found actively primes bad
// output (see lib/imagePromptCompiler.ts's BANNED_COLLAGE_TERMS comment).
const DEFAULT_NEGATIVE_PROMPT = "blurry, distorted face, warped hands, extra limbs, flicker, sudden cut, low quality";

export async function generateKlingVideo(opts: {
  imageUrl: string;
  // v3-only, real capability verified this session with a paid test call: an end-frame anchor.
  // Pass the SAME StoryDay's later shot (e.g. payoff) whose environment already matches imageUrl's
  // via lib/shotDirection.ts's ensureEnvironmentAnchored — confirmed the resulting video holds that
  // shared environment for its full length, not just at the two bookend frames. Mutually exclusive
  // with multi_prompt (confirmed via a real 422: "End Image Url is not supported with Multi
  // Prompt") — this function never sends multi_prompt, so no conflict here.
  endImageUrl?: string;
  prompt: string;
  negativePrompt?: string;
  cfgScale?: number;
  durationSeconds?: number;
  // No-op on v3 (its input type has no aspect_ratio field — verified against the real generated
  // types) — v3 infers aspect ratio from the source image instead. Kept for caller compatibility;
  // every image this app feeds in is already generated at 9:16 (lib/imagePromptCompiler.ts), so
  // the video comes out 9:16 regardless.
  aspectRatio?: "9:16" | "16:9" | "1:1";
  tier?: KlingTier;
  persist?: { mediaId: string };
}): Promise<string> {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const falModel: string = KLING_MODEL[opts.tier ?? "pro"];
  // v3's duration is a wider closed enum ("3".."15", integers only) than v1.6/v2.1's "5"|"10" —
  // round and clamp into range instead of snapping to one of two fixed values.
  const duration = String(Math.min(15, Math.max(3, Math.round(opts.durationSeconds ?? 10))));
  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    negative_prompt: opts.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT,
    cfg_scale: opts.cfgScale ?? 0.6,
    duration,
    // v3's field is start_image_url, not image_url (a real breaking rename from v1.6/v2.1 —
    // verified against the generated types AND a real successful test call).
    start_image_url: opts.imageUrl,
    // v3 defaults generate_audio to true (verified in the generated types) — our content doctrine
    // is explicitly silent (see lib/seedancePromptCompiler.ts's NO_AUDIO_LOCK), so this must always
    // be sent explicitly or v3 will add unwanted voice/sound.
    generate_audio: false,
  };
  if (opts.endImageUrl) input.end_image_url = opts.endImageUrl;

  const sub = (await fal.queue.submit(falModel, { input })) as { request_id: string };

  let status: string | undefined;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fal.queue.status(falModel, { requestId: sub.request_id });
    status = (s as { status?: string }).status;
    if (status === "COMPLETED") break;
    if (status === "ERROR") throw new Error(`Kling job errored: ${JSON.stringify(s).slice(0, 400)}`);
  }
  if (status !== "COMPLETED") throw new Error(`Kling job did not complete in time, last status=${status}`);

  const result = await fal.queue.result(falModel, { requestId: sub.request_id });
  const srcUrl =
    (result as { data?: { video?: { url?: string } } })?.data?.video?.url ??
    (result as { video?: { url?: string } })?.video?.url;
  if (!srcUrl) throw new Error(`Kling: no video URL in result — raw: ${JSON.stringify(result).slice(0, 400)}`);

  if (!opts.persist) return srcUrl;

  const vid = await fetch(srcUrl);
  if (!vid.ok) throw new Error(`Kling video download failed ${vid.status}`);
  const buf = Buffer.from(await vid.arrayBuffer());
  const path = `videos/${opts.persist.mediaId}.mp4`;
  const { error } = await supabase.storage.from("character-media").upload(path, buf, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Kling storage upload: ${error.message}`);
  const { data: pub } = supabase.storage.from("character-media").getPublicUrl(path);
  return pub.publicUrl;
}

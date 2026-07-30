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

const KLING_MODEL: Record<KlingTier, string> = {
  standard: "fal-ai/kling-video/v1.6/standard/image-to-video",
  pro: "fal-ai/kling-video/v2.1/pro/image-to-video",
};

// Verified against the real @fal-ai/client generated types (node_modules/@fal-ai/client/src/types/
// endpoints.d.ts, KlingVideoV2MasterImageToVideoInput / KlingVideoV16ProImageToVideoInput) rather
// than guessed from docs — every Kling image-to-video variant exposes negative_prompt (default
// "blur, distort, and low quality") and cfg_scale (default 0.5, higher = follows the text prompt
// more literally). Kling's own prompting guide recommends a real negative_prompt field for exactly
// this — distinct from embedding negated instructions in the descriptive prompt text itself, which
// this session found actively primes bad output (see lib/imagePromptCompiler.ts's
// BANNED_COLLAGE_TERMS comment).
const DEFAULT_NEGATIVE_PROMPT = "blurry, distorted face, warped hands, extra limbs, flicker, sudden cut, low quality";

export async function generateKlingVideo(opts: {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  cfgScale?: number;
  durationSeconds?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  tier?: KlingTier;
  persist?: { mediaId: string };
}): Promise<string> {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const falModel: string = KLING_MODEL[opts.tier ?? "pro"];
  // duration is a closed enum ("5" | "10") on every Kling image-to-video variant we checked, not a
  // free string — snap to the nearest allowed value instead of sending an unsupported one.
  const duration = (opts.durationSeconds ?? 10) <= 7 ? "5" : "10";
  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    negative_prompt: opts.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT,
    cfg_scale: opts.cfgScale ?? 0.6,
    duration,
    aspect_ratio: opts.aspectRatio ?? "9:16",
    image_url: opts.imageUrl,
  };

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

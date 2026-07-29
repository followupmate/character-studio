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

export async function generateKlingVideo(opts: {
  imageUrl: string;
  prompt: string;
  durationSeconds?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  tier?: KlingTier;
  persist?: { mediaId: string };
}): Promise<string> {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) throw new Error("FAL_API_KEY not configured");
  fal.config({ credentials: falApiKey });

  const falModel: string = KLING_MODEL[opts.tier ?? "pro"];
  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    duration: String(opts.durationSeconds ?? 10),
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

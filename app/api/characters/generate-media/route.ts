import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { supabase } from "@/lib/supabase";
import { generateSoulImage, soulConfigured, FALLBACK_SOUL_ID } from "@/lib/higgsfieldSoul";
import { sanitizePrompt, stripPromptHeader } from "@/lib/promptClean";
import { cronAuthorized } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

// Instagram aspect ratio limits: feed/carousel min 4:5 (0.8), max 1.91:1 — 9:16 is NOT supported for carousel
const SLOT_IMAGE_SIZE: Record<string, { width: number; height: number }> = {
  carousel_1:       { width: 864, height: 1080 },  // 4:5 — Instagram feed carousel
  carousel_2:       { width: 864, height: 1080 },
  carousel_3:       { width: 864, height: 1080 },
  carousel_4:       { width: 864, height: 1080 },
  carousel_5:       { width: 864, height: 1080 },
  reel_start_frame: { width: 576, height: 1024 },  // 9:16 — Reels / Stories
  story_bts:        { width: 576, height: 1024 },
};

const VIDEO_SLOTS = new Set(["reel_video"]);

// Veo video generation models
// veo-3.1-fast-generate-preview = Veo 3.1 Fast (fastest, business-accessible)
// veo-3.1-generate-preview      = Veo 3.1 (highest quality)
// veo-3.0-generate-001          = Veo 3.0 (stable)
const VEO_MODEL_DEFAULT = "veo-3.1-fast-generate-preview";

// Clinical skin descriptors — Visual AI Club doctrine
// Bypasses AI smoothing algorithms by using anatomical vocabulary instead of beauty words
const CLINICAL_SKIN = "unretouched skin, visible pores, natural skin texture, skin imperfections intact, no smoothing, no digital retouching, raw skin surface, peach fuzz visible, micro-texture preserved, natural skin unevenness, real photograph not rendered, captured with physical camera, dermatological precision";

// iPhone photographic signature — makes output look like real Instagram content
const IPHONE_SIG = "iPhone 15 Pro Max TrueDepth 12MP f/1.9 23mm selfie lens. Apple computational HDR: lifted shadows, compressed highlights, no cinematic blacks. Smart HDR over-sharpening on hair and fabric edges. Digital noise in shadows, not film grain. Apple Deep Fusion skin rendering. Apple color science: warm-neutral white balance, magenta-leaning skin warmth. Flat depth of field, no bokeh, no subject isolation. Personal Instagram story feel, not editorial.";

// ── BFL generation ─────────────────────────────────────────────
async function generateWithBFL(
  prompt: string,
  referenceUrls: string[],
  imageSize: { width: number; height: number },
  bflKey: string
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt: `Use the face from the reference images exactly, preserving facial structure, eyes, nose, lips, skin tone and identity with zero beautification or reinterpretation. ${IPHONE_SIG} ${prompt} ${CLINICAL_SKIN}`,
    width: imageSize.width,
    height: imageSize.height,
    steps: 50,
  };

  // Attach up to 4 reference images
  const refs = referenceUrls.slice(0, 4);
  if (refs[0]) body.input_image   = refs[0];
  if (refs[1]) body.input_image_2 = refs[1];
  if (refs[2]) body.input_image_3 = refs[2];
  if (refs[3]) body.input_image_4 = refs[3];

  const submitRes = await fetch("https://api.bfl.ai/v1/flux-2-pro-preview", {
    method: "POST",
    headers: { "x-key": bflKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`BFL submit failed ${submitRes.status}: ${err}`);
  }

  const job = await submitRes.json() as { polling_url: string };

  // Poll until ready (max 4 min)
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(job.polling_url, {
      headers: { "x-key": bflKey },
    });
    const poll = await pollRes.json() as { status: string; result?: { sample: string } };
    if (poll.status === "Ready" && poll.result?.sample) return poll.result.sample;
    if (poll.status === "Error") throw new Error("BFL generation failed");
  }

  throw new Error("BFL generation timed out");
}

// ── Google Nano Banana generation (character sheet technique) ──
// model: "gemini-3.1-flash-image" = Nano Banana 2 (fast)
//        "gemini-3-pro-image"     = Nano Banana Pro (quality)
//
// Uses an AI-generated character reference sheet (not real person photos)
// as the single reference image. AI-generated refs don't trigger Google's
// anti-deepfake IMAGE_SAFETY classifier, unlike real person photographs.
// Aspect ratio labels for Google Gemini image generation.
// Google doesn't accept width/height params — ratio must be stated in the prompt.
const GOOGLE_ASPECT_LABELS: Record<string, string> = {
  "4:5":  "Portrait orientation. Final image must be TALLER than wide, 4:5 aspect ratio.",
  "9:16": "Vertical portrait orientation. Final image must be 9:16 aspect ratio, very tall.",
  "1:1":  "Square image, 1:1 aspect ratio.",
};

async function generateWithGoogle(
  scenePrompt: string,
  characterSheetUrl: string | null,
  googleKey: string,
  mediaId: string,
  modelId = "gemini-3.1-flash-image",
  aspectRatio = "4:5",
  characterName: string | null = null
): Promise<string> {
  const aspectLabel = GOOGLE_ASPECT_LABELS[aspectRatio] ?? GOOGLE_ASPECT_LABELS["4:5"];
  const cleanPrompt = sanitizePrompt(stripPromptHeader(scenePrompt));

  const parts: unknown[] = [];

  // Attach character sheet as single AI-generated reference
  if (characterSheetUrl) {
    try {
      const res = await fetch(characterSheetUrl);
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const rawMime = res.headers.get("content-type") ?? "";
      const mime = rawMime.startsWith("image/") && !rawMime.includes("octet-stream")
        ? rawMime.split(";")[0]
        : characterSheetUrl?.toLowerCase().endsWith(".webp") ? "image/webp"
        : characterSheetUrl?.toLowerCase().endsWith(".png")  ? "image/png"
        : "image/jpeg";
      parts.push({ inlineData: { mimeType: mime, data: b64 } });
    } catch { /* proceed text-only if sheet fetch fails */ }
  }

  const subjectName = characterName ? `${characterName} ` : "";
  const referenceInstruction = parts.length > 0
    ? `Generate ONE single photograph. ${subjectName}from the reference image is the main subject — preserve her exact facial structure, eye shape, nose, lips, skin tone, and hair with zero deviation. Do NOT generate a collage or multi-panel layout.`
    : "";

  // Short caption-style prompts (< 60 words) proved to work better WITHOUT the iPhone
  // signature — the sig adds skin/rendering language that pushes safety classifier.
  // Longer cinematic prompts keep the sig for photographic style anchoring.
  const isShortCaption = cleanPrompt.split(/\s+/).length < 60;
  const styleHint = isShortCaption
    ? "Photorealistic lifestyle photo."
    : IPHONE_SIG;

  // Order: identity anchor → scene → aspect → style
  // Character identity FIRST so Nano treats her as the primary subject, not a scene prop.
  const textInstruction = [referenceInstruction, cleanPrompt, aspectLabel, styleHint]
    .filter(Boolean)
    .join(" ");

  parts.push({ text: textInstruction });

  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
        safetySettings: [
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      }),
    }
  );

  const resText = await apiRes.text();
  if (!apiRes.ok) throw new Error(`Google API ${apiRes.status}: ${resText.slice(0, 300)}`);

  let data: GoogleApiResponse;
  try { data = JSON.parse(resText); }
  catch { throw new Error(`Google API: invalid JSON — ${resText.slice(0, 200)}`); }

  const candidate = data.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

  if (!imagePart?.inlineData) {
    const textPart = candidate?.content?.parts?.find((p) => p.text);
    const finishReason = (candidate as Record<string, unknown>)?.finishReason;
    const detail = textPart?.text ?? finishReason ?? resText.slice(0, 200);
    throw new Error(`Google API: no image returned. ${detail}`);
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  const ext = imagePart.inlineData.mimeType?.includes("jpeg") ? "jpg" : "png";
  const storagePath = `media/${mediaId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("character-media")
    .upload(storagePath, imageBuffer, {
      contentType: imagePart.inlineData.mimeType ?? "image/jpeg",
      upsert: true,
    });

  if (uploadErr) {
    console.warn("[google] Storage upload failed:", uploadErr.message);
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  }

  const { data: publicData } = supabase.storage
    .from("character-media")
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

interface GoogleApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType: string; data: string };
        text?: string;
      }>;
    };
  }>;
}

// ── Veo video generation (Gemini long-running operation) ────────
// Supports image-to-video when startFrameUrl is provided, falls back to text-to-video.
async function generateWithVeo(
  scenePrompt: string,
  googleKey: string,
  mediaId: string,
  startFrameUrl: string | null,
  modelId = VEO_MODEL_DEFAULT
): Promise<string> {
  const cleanPrompt = sanitizePrompt(stripPromptHeader(scenePrompt));

  // Build instance: image-to-video when start frame available
  const instance: Record<string, unknown> = {
    prompt: `Cinematic 9:16 vertical video. Real person. Natural movement. ${cleanPrompt}`,
  };

  if (startFrameUrl) {
    try {
      const res = await fetch(startFrameUrl);
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const rawMime = res.headers.get("content-type") ?? "";
      const mime = rawMime.startsWith("image/") && !rawMime.includes("octet-stream")
        ? rawMime.split(";")[0]
        : startFrameUrl.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      instance.image = { bytesBase64Encoded: b64, mimeType: mime };
    } catch { /* fallback to text-to-video */ }
  }

  // 1. Submit long-running operation
  const submitRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predictLongRunning?key=${googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [instance],
        parameters: { aspectRatio: "9:16", durationSeconds: 8 },
      }),
    }
  );

  const submitText = await submitRes.text();
  if (!submitRes.ok) throw new Error(`Veo submit ${submitRes.status}: ${submitText.slice(0, 300)}`);

  let op: { name?: string };
  try { op = JSON.parse(submitText); }
  catch { throw new Error(`Veo submit: invalid JSON — ${submitText.slice(0, 200)}`); }
  if (!op.name) throw new Error(`Veo: no operation name. ${submitText.slice(0, 200)}`);

  // 2. Poll until done (max 5 min, 10s interval)
  let videoUri: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const pollRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${op.name}?key=${googleKey}`
    );
    const pollText = await pollRes.text();
    let poll: VeoOperationResponse;
    try { poll = JSON.parse(pollText); }
    catch { throw new Error(`Veo poll: invalid JSON — ${pollText.slice(0, 200)}`); }

    if (poll.done) {
      // Check for server-side error first (code 13 = INTERNAL, 14 = UNAVAILABLE)
      if (poll.error) {
        const isRetryable = poll.error.code === 13 || poll.error.code === 14;
        const hint = isRetryable ? " (Google internal error — skús znova)" : "";
        throw new Error(`Veo: ${poll.error.message ?? "generation failed"}${hint}`);
      }

      // Check for safety filter on video content
      const filtered = poll.response?.generateVideoResponse?.raiMediaFilteredReasons;
      if (filtered && filtered.length > 0) {
        throw new Error(`Veo: video blocked by safety filter — ${filtered.join(", ")} (uprav prompt)`);
      }

      // Primary path: generatedSamples[0].video.uri
      const samples = poll.response?.generateVideoResponse?.generatedSamples;
      if (samples?.[0]?.video?.uri) {
        videoUri = samples[0].video.uri;
        break;
      }

      // Fallback path: predictions[0].bytesBase64Encoded (some API versions)
      const predictions = (poll.response as Record<string, unknown> | undefined)
        ?.predictions as Array<{ bytesBase64Encoded?: string; mimeType?: string }> | undefined;
      if (predictions?.[0]?.bytesBase64Encoded) {
        const b64 = predictions[0].bytesBase64Encoded;
        const videoBuffer = Buffer.from(b64, "base64");
        const storagePath = `videos/${mediaId}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from("character-media")
          .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });
        if (uploadErr) throw new Error(`Veo: storage upload failed: ${uploadErr.message}`);
        const { data: publicData } = supabase.storage
          .from("character-media")
          .getPublicUrl(storagePath);
        return publicData.publicUrl;
      }

      // Nothing matched — dump full response for debugging
      throw new Error(`Veo: no video in response. ${pollText.slice(0, 600)}`);
    }
    if (poll.error && !poll.done) throw new Error(`Veo poll error: ${poll.error.message}`);
  }

  if (!videoUri) throw new Error("Veo: generation timed out after 5 minutes");

  // 3. Download video → upload to Supabase Storage
  // Veo URIs from generativelanguage.googleapis.com require the API key as query param
  const downloadUrl = videoUri.includes("generativelanguage.googleapis.com")
    ? `${videoUri}${videoUri.includes("?") ? "&" : "?"}key=${googleKey}`
    : videoUri;
  const videoRes = await fetch(downloadUrl);
  if (!videoRes.ok) throw new Error(`Veo: failed to download video ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const storagePath = `videos/${mediaId}.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from("character-media")
    .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

  if (uploadErr) throw new Error(`Veo: storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage
    .from("character-media")
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

interface VeoOperationResponse {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    "@type"?: string;
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; encoding?: string };
      }>;
      raiMediaFilteredReasons?: string[];
    };
    predictions?: Array<{
      bytesBase64Encoded?: string;
      mimeType?: string;
    }>;
  };
}

// ── fal.ai generation ──────────────────────────────────────────
async function generateWithFal(
  prompt: string,
  loraUrl: string,
  loraScale: number,
  imageSize: { width: number; height: number },
  steps: number,
  guidance: number
): Promise<string> {
  const outputFormat = "jpeg" as const;
  const result = await fal.subscribe("fal-ai/flux-lora", {
    input: {
      prompt,
      loras: [{ path: loraUrl, scale: loraScale }],
      num_images: 1,
      image_size: imageSize,
      num_inference_steps: steps,
      guidance_scale: guidance,
      output_format: outputFormat,
      seed: Math.floor(Math.random() * 2_147_483_647),
    },
  }) as FalResult;

  const url = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url;
  if (!url) throw new Error("No image URL in fal.ai response");
  return url;
}

// ── Kling i2v generation (fal.ai) ─────────────────────────────
// Uses start frame (image-to-video). Falls back to text-to-video if no startFrameUrl.
// Model: fal-ai/kling-video/v2.1/pro/image-to-video (update to v3 when available)
const KLING_MODEL_I2V = "fal-ai/kling-video/v2.1/pro/image-to-video";
const KLING_MODEL_T2V = "fal-ai/kling-video/v2.1/pro/text-to-video";

interface KlingResult {
  data?: { video?: { url?: string } };
  video?: { url?: string };
}

async function generateWithKling(
  prompt: string,
  startFrameUrl: string | null,
  mediaId: string,
  audioStyle: "scene" | "ambient" | "dialogue" | "silent" = "scene"
): Promise<string> {
  const cleanedPrompt = sanitizePrompt(stripPromptHeader(prompt));

  const model = startFrameUrl ? KLING_MODEL_I2V : KLING_MODEL_T2V;

  const input: Record<string, unknown> = {
    prompt: `Cinematic 9:16 vertical video. Real person. Natural movement. ${cleanedPrompt}`,
    duration: "10",
    aspect_ratio: "9:16",
  };

  if (startFrameUrl) {
    input.image_url = startFrameUrl;
  }

  const result = await fal.subscribe(model, { input }) as KlingResult;

  let videoUrl = result?.data?.video?.url ?? result?.video?.url;
  if (!videoUrl) throw new Error(`Kling: no video URL in response`);

  // Kling has no native audio. Add scene-matched diegetic audio via mmaudio (unless silent).
  if (audioStyle !== "silent") {
    try {
      const audioRes = await fal.subscribe("fal-ai/mmaudio-v2", {
        input: { video_url: videoUrl, prompt: AUDIO_HINTS[audioStyle] ?? AUDIO_HINTS.scene, num_steps: 25 },
      }) as KlingResult;
      const withAudio = audioRes?.data?.video?.url ?? audioRes?.video?.url;
      if (withAudio) videoUrl = withAudio;
    } catch (e) {
      console.warn("[kling] mmaudio failed, keeping silent video:", e instanceof Error ? e.message : e);
    }
  }

  // Download video → upload to Supabase Storage
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Kling: failed to download video ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const storagePath = `videos/${mediaId}.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from("character-media")
    .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

  if (uploadErr) throw new Error(`Kling: storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage
    .from("character-media")
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

// ── Seedance 2.0 generation (fal.ai / ByteDance) ──────────────
// Confirmed model IDs (official fal.ai docs):
//   bytedance/seedance-2.0/image-to-video            $0.3034/s  720p
//   bytedance/seedance-2.0/fast/image-to-video       $0.2419/s  720p
//   bytedance/seedance-2.0/reference-to-video        $0.3024/s  720p
//   bytedance/seedance-2.0/fast/reference-to-video   $0.2419/s  720p
//
// seedance-i2v  → image-to-video  (start frame required; "auto" aspect = inherit from input)
// seedance-ref  → reference-to-video (char ref photos + optional start frame as @Image1)
// seedance-fast → fast/image-to-video ($0.24/s, same quality target but faster queue)

interface SeedanceResult {
  data?: { video?: { url?: string }; seed?: number };
  video?: { url?: string };
}

// audioStyle controls what Seedance generates as audio track.
// Seedance has no dedicated audio param — audio type is driven entirely by prompt language.
const AUDIO_HINTS: Record<string, string> = {
  scene:    "Sound design: natural diegetic sounds only — fabric movement, soft breathing, ambient environment, no background music.",
  ambient:  "Sound design: subtle ambient background music matching the mood.",
  dialogue: "Sound design: clear foreground voice and speech, natural room tone, no music.",
  silent:   "Muted audio. No sound effects, no music, no speech.",
};

async function generateWithSeedance(
  rawPrompt: string,
  referenceImageUrls: string[],
  startFrameUrl: string | null,
  mediaId: string,
  mode: "reference" | "i2v" | "fast" = "reference",
  audioStyle: "scene" | "ambient" | "dialogue" | "silent" = "scene",
  characterSheetUrl: string | null = null
): Promise<string> {
  const audioHint = AUDIO_HINTS[audioStyle] ?? AUDIO_HINTS.scene;
  const cleanedPrompt = sanitizePrompt(stripPromptHeader(rawPrompt));

  let videoUrl: string;

  if (mode === "i2v" || mode === "fast") {
    // ── Image-to-Video: animate the start frame ──────────────
    // aspect_ratio "auto" inherits 9:16 from the input image (cleaner than hardcoding)
    if (!startFrameUrl) throw new Error("Seedance i2v: start frame required");

    const modelId = mode === "fast"
      ? "bytedance/seedance-2.0/fast/image-to-video"
      : "bytedance/seedance-2.0/image-to-video";

    const result = await fal.subscribe(modelId, {
      input: {
        prompt: `Cinematic motion. ${cleanedPrompt} ${audioHint}`,
        image_url: startFrameUrl,
        resolution: "720p",
        duration: "10",
        aspect_ratio: "auto",
        generate_audio: audioStyle !== "silent",
      },
    }) as SeedanceResult;

    videoUrl = result?.data?.video?.url ?? result?.video?.url ?? "";
  } else {
    // ── Reference-to-Video ──────────────────────────────────────
    // Image order strategy:
    //   @Image1 = start frame (if exists) — scene/motion anchor
    //   @Image2 = character sheet (small 70KB WebP) — identity reference
    //   Fallback: use character sheet as @Image1 if no start frame
    // We deliberately avoid large 4MB reference PNGs — they risk 422 from fal.ai payload limits.
    const images: string[] = [];
    if (startFrameUrl) images.push(startFrameUrl);
    if (characterSheetUrl && images.length < 9) images.push(characterSheetUrl);
    // Only add individual ref photos if we still have space and no sheet available
    if (!characterSheetUrl) {
      for (const u of referenceImageUrls.slice(0, 2)) {
        if (images.length >= 9) break;
        images.push(u);
      }
    }

    if (images.length === 0) throw new Error("Seedance ref: no reference images available (set character_sheet_url or reference_image_urls in DB)");

    const prompt = `@Image1 ${cleanedPrompt}`;

    const result = await fal.subscribe("bytedance/seedance-2.0/reference-to-video", {
      input: {
        prompt: `${prompt} ${audioHint}`,
        image_urls: images,
        resolution: "720p",
        duration: "10",
        aspect_ratio: "9:16",
        generate_audio: audioStyle !== "silent",
      },
    }) as SeedanceResult;

    videoUrl = result?.data?.video?.url ?? result?.video?.url ?? "";
  }

  if (!videoUrl) throw new Error("Seedance: no video URL in response");

  // Download → Supabase Storage
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Seedance: failed to download video ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const storagePath = `videos/${mediaId}.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from("character-media")
    .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

  if (uploadErr) throw new Error(`Seedance: storage upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage
    .from("character-media")
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

// ── Transient-failure detection ────────────────────────────────
// Errors matching this pattern (rate limits, 5xx, network drops) get ONE retry
// with a short backoff. Safety blocks and validation errors are NOT retried —
// the Google → Higgsfield → fal fallback chain handles those. Retry applies to
// image slots only; video generations run minutes-long and would blow the
// serverless time budget.
const TRANSIENT_ERROR = /(\b(429|500|502|503|504)\b|timed?\s?out|ECONNRESET|ETIMEDOUT|fetch failed|socket|network|UNAVAILABLE|overloaded|rate.?limit)/i;

// Start frame (reel_start_frame) from the same batch — needed by every video provider.
async function findStartFrame(batchId: string): Promise<string | null> {
  const { data } = await supabase
    .from("chs_media")
    .select("media_url")
    .eq("batch_id", batchId)
    .eq("slot", "reel_start_frame")
    .single();
  return data?.media_url ?? null;
}

// ── Main handler ───────────────────────────────────────────────
export async function POST(req: Request) {
  // Auth: CRON_SECRET required for external/server-to-server calls (fail-closed
  // via cronAuthorized). Browser requests from the app UI are allowed without a
  // secret — see M1-3 in docs/AUDIT to close this Origin bypass once a UI
  // session/password exists (deferred: single-operator app).
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const falApiKey    = process.env.FAL_API_KEY;
  const bflApiKey    = process.env.BFL_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;

  if (!falApiKey) return NextResponse.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  fal.config({ credentials: falApiKey });

  try {
    const body = await req.json();
    const {
      mediaId,
      batchId,
      model          = "auto",
      loraScale      = 0.85,
      steps          = 40,
      guidance       = 3.5,
      promptOverride,
      audioStyle     = "scene",
      imageOnly      = false,
    } = body as {
      mediaId?: string;
      batchId?: string;
      model?: string;
      audioStyle?: "scene" | "ambient" | "dialogue" | "silent";
      loraScale?: number;
      steps?: number;
      guidance?: number;
      promptOverride?: string;
      imageOnly?: boolean;
    };

    if (!mediaId && !batchId) {
      return NextResponse.json({ error: "Provide mediaId or batchId" }, { status: 400 });
    }

    // ── Resolve media records ──────────────────────────────────
    let mediaRecords: MediaRecord[] = [];

    if (mediaId) {
      const { data, error } = await supabase
        .from("chs_media")
        .select("id, slot, type, channel, shot_archetype, higgsfield_prompt, batch_id, generation_status")
        .eq("id", mediaId)
        .single();
      if (error || !data) return NextResponse.json({ error: "Media not found" }, { status: 404 });
      mediaRecords = [data];
    } else {
      const { data, error } = await supabase
        .from("chs_media")
        .select("id, slot, type, channel, shot_archetype, higgsfield_prompt, batch_id, generation_status, media_url")
        .eq("batch_id", batchId!);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const hasVeo = !!googleApiKey;
      // Generate any slot that has no image yet. NOTE: generation_status="completed" is set by the
      // prompt-builder (dailyBatch) to mean "prompt ready", NOT "image ready" — so we must filter on
      // the presence of media_url, not generation_status, or one-click batch would generate nothing.
      mediaRecords = (data ?? []).filter((m) => {
        if (m.media_url) return false; // already has an image
        if (VIDEO_SLOTS.has(m.slot)) return imageOnly ? false : hasVeo; // one-click "whole day" = images only
        return true;
      });
    }

    if (mediaRecords.length === 0) {
      return NextResponse.json({ message: "Nothing to generate", results: [] });
    }

    // ── Fetch character ────────────────────────────────────────
    const batchIdToUse = mediaRecords[0].batch_id;
    const { data: plan } = await supabase
      .from("chs_daily_plans")
      .select("character_id")
      .eq("id", batchIdToUse)
      .single();

    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const { data: character } = await supabase
      .from("chs_characters")
      .select("id, name, lora_model_id, lora_trigger_word, reference_image_urls, character_sheet_url, soul_id")
      .eq("id", plan.character_id)
      .single();

    if (!character?.lora_model_id) {
      return NextResponse.json({ error: "No lora_model_id configured" }, { status: 422 });
    }
    // Non-null alias — TS doesn't carry the narrowing above into processSlot below.
    const char = character;

    const triggerWord        = character.lora_trigger_word ?? "SUBJECT";
    const referenceUrls      = (character.reference_image_urls as string[] | null) ?? [];
    const characterSheetUrl  = (character as Record<string, unknown>).character_sheet_url as string | null ?? null;
    const hasGoogle          = !!googleApiKey;

    // ── Generate one slot ──────────────────────────────────────
    async function processSlot(media: MediaRecord): Promise<GenerateResult> {
      await supabase
        .from("chs_media")
        .update({ generation_status: "generating" })
        .eq("id", media.id);

      const isVideoSlot = VIDEO_SLOTS.has(media.slot);
      const imageSize   = SLOT_IMAGE_SIZE[media.slot] ?? { width: 832, height: 1040 };

      // If promptOverride is provided (manual regeneration from UI), save it to DB
      // so future regenerations also use the corrected prompt.
      const effectivePrompt = promptOverride?.trim() || media.higgsfield_prompt;
      if (promptOverride?.trim() && promptOverride.trim() !== media.higgsfield_prompt) {
        await supabase
          .from("chs_media")
          .update({ higgsfield_prompt: promptOverride.trim() })
          .eq("id", media.id);
      }

      const prompt = `${triggerWord}, ${effectivePrompt}`;

      // Determine provider
      // kling               → Kling i2v via fal.ai (best video quality)
      // veo / veo-quality   → Veo 3.1 Fast / Veo 3.1 for video slots
      // google / google-pro → Nano Banana (2 or Pro) for image slots
      // bfl                 → BFL FLUX.2 multi-ref (fallback)
      // flux-lora           → fal.ai LoRA (scene consistency fallback)
      const useSeedanceRef  = isVideoSlot && model === "seedance-ref";
      const useSeedanceI2V  = isVideoSlot && model === "seedance-i2v";
      const useSeedanceFast = isVideoSlot && model === "seedance-fast";
      const useKling       = isVideoSlot && model === "kling";
      const useVeoQuality  = model === "veo-quality";
      const anySeedance    = useSeedanceRef || useSeedanceI2V || useSeedanceFast;
      const useVeo         = isVideoSlot && !useKling && !anySeedance && !!googleApiKey && (model === "veo" || model === "veo-quality" || model === "auto");
      const useGooglePro   = !isVideoSlot && model === "google-pro";
      // Engine strategy (auto): Google Nano Banana FIRST for all image slots — it produces the
      // richest, populated, real-world environments (user-confirmed: gym/café excellent; fal LoRA
      // leaves her "alone" in empty scenes). On a Google safety block (intimate/suggestive) or
      // failure, auto-fall back to fal LoRA (faithful face, handles intimate). Explicit model overrides.
      const useGoogle      = !isVideoSlot && (model === "google" || model === "google-pro" || (model === "auto" && hasGoogle));
      const useBFL         = !useGoogle && !useVeo && !useKling && !anySeedance && (model === "bfl");
      const useFluxPro     = model === "flux-pro";

      try {
        let mediaUrl: string;
        let provider = "falai";

        if (useSeedanceRef || useSeedanceI2V || useSeedanceFast) {
          const startFrameUrl = await findStartFrame(media.batch_id);
          const seedanceMode = useSeedanceI2V ? "i2v" : useSeedanceFast ? "fast" : "reference";
          mediaUrl = await generateWithSeedance(
            effectivePrompt,
            referenceUrls,
            startFrameUrl,
            media.id,
            seedanceMode,
            audioStyle,
            characterSheetUrl
          );
          provider = `seedance-${seedanceMode}`;
        } else if (useKling) {
          const startFrameUrl = await findStartFrame(media.batch_id);
          mediaUrl = await generateWithKling(effectivePrompt, startFrameUrl, media.id, audioStyle);
          provider = "kling";
        } else if (useVeo) {
          const startFrameUrl = await findStartFrame(media.batch_id);
          const veoModel = useVeoQuality ? "veo-3.1-generate-preview" : VEO_MODEL_DEFAULT;
          mediaUrl = await generateWithVeo(
            effectivePrompt,
            googleApiKey!,
            media.id,
            startFrameUrl,
            veoModel
          );
          provider = useVeoQuality ? "veo-quality" : "veo";
        } else if (useGoogle) {
          const googleModel = useGooglePro ? "gemini-3-pro-image" : "gemini-3.1-flash-image";
          // Determine aspect ratio from slot — carousel = 4:5, reel/story = 9:16
          const isVerticalSlot = ["reel_start_frame", "story_bts"].includes(media.slot ?? "");
          const googleAspect = isVerticalSlot ? "9:16" : "4:5";
          try {
            mediaUrl = await generateWithGoogle(
              effectivePrompt,
              characterSheetUrl,
              googleApiKey!,
              media.id,
              googleModel,
              googleAspect,
              char.name ?? null
            );
            provider = useGooglePro ? "google-pro" : "google";
          } catch (gerr) {
            // Auto mode fallback chain: Google blocks intimate/suggestive content. Prefer Higgsfield
            // Soul V2 (faithful trained identity + realistic skin) FIRST; only if that also fails do we
            // drop to fal LoRA. Explicit Google request → surface the real error.
            if (model === "auto") {
              const soulId = (char.soul_id as string | null) ?? FALLBACK_SOUL_ID;
              const soulAspect = isVerticalSlot ? "9:16" : "3:4"; // feed 4:5 → closest Soul ratio 3:4
              try {
                if (!soulConfigured()) throw new Error("Higgsfield not configured");
                mediaUrl = await generateSoulImage({ prompt: effectivePrompt, soulId, aspect: soulAspect, mediaId: media.id });
                provider = "higgsfield-soul-fallback";
              } catch (herr) {
                console.warn("[generate-media] Higgsfield fallback failed, dropping to fal LoRA:", herr instanceof Error ? herr.message : herr);
                mediaUrl = await generateWithFal(prompt, char.lora_model_id, loraScale, imageSize, steps, guidance);
                provider = "falai-fallback";
              }
            } else {
              throw gerr; // explicit Google request → surface the real error
            }
          }
        } else if (useBFL) {
          mediaUrl = await generateWithBFL(
            `The woman from the reference images. ${effectivePrompt}`,
            referenceUrls,
            imageSize,
            bflApiKey!
          );
          provider = "bfl";
        } else if (useFluxPro) {
          const outputFormat = "jpeg" as const;
          const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            input: { prompt, image_size: imageSize, num_inference_steps: steps, guidance_scale: guidance, output_format: outputFormat, num_images: 1 } as any,
          }) as FalResult;
          mediaUrl = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? "";
          if (!mediaUrl) throw new Error("No URL from flux-pro");
          provider = "flux-pro";
        } else {
          mediaUrl = await generateWithFal(
            prompt,
            char.lora_model_id,
            loraScale,
            imageSize,
            steps,
            guidance
          );
        }

        // Append cache-buster to Supabase storage URLs so the browser fetches
        // the new file after regeneration instead of serving the cached old one.
        const urlToSave = mediaUrl.includes("supabase.co/storage")
          ? `${mediaUrl.split("?")[0]}?t=${Date.now()}`
          : mediaUrl;

        await supabase
          .from("chs_media")
          .update({ media_url: urlToSave, source_url: urlToSave, generation_status: "completed", status: "ready" })
          .eq("id", media.id);

        return { mediaId: media.id, slot: media.slot, provider, success: true, url: urlToSave };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("chs_media")
          .update({ generation_status: "failed", last_error: msg.slice(0, 1000) })
          .eq("id", media.id);
        return { mediaId: media.id, slot: media.slot, provider: useBFL ? "bfl" : "falai", success: false, error: msg };
      }
    }

    // ── Run slots in parallel (worker pool) ────────────────────
    // Slots used to generate strictly one-after-another — a full 7-slot day took
    // 3–7 minutes and flirted with the 300s serverless limit. A small pool keeps
    // provider rate limits happy while cutting wall time ~3×. Image slots run
    // first; video slots wait for them because they consume the freshly
    // generated reel_start_frame.
    const CONCURRENCY = 3;

    async function runPool(items: MediaRecord[]): Promise<GenerateResult[]> {
      const out: GenerateResult[] = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
          while (next < items.length) {
            const item = items[next++];
            let res = await processSlot(item);
            if (!res.success && !VIDEO_SLOTS.has(item.slot) && TRANSIENT_ERROR.test(res.error ?? "")) {
              await supabase.from("chs_media").update({ generation_status: "retrying" }).eq("id", item.id);
              await new Promise((r) => setTimeout(r, 3000));
              res = await processSlot(item);
            }
            out.push(res);
          }
        })
      );
      return out;
    }

    const imageRecords = mediaRecords.filter((m) => !VIDEO_SLOTS.has(m.slot));
    const videoRecords = mediaRecords.filter((m) => VIDEO_SLOTS.has(m.slot));
    const results = [...(await runPool(imageRecords)), ...(await runPool(videoRecords))];

    const succeeded = results.filter((r) => r.success).length;
    return NextResponse.json({ success: true, generated: succeeded, total: results.length, results });
  } catch (err) {
    console.error("[generate-media]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── Types ──────────────────────────────────────────────────────
interface MediaRecord {
  id: string;
  slot: string;
  type: string;
  channel: string;
  shot_archetype: string | null;
  higgsfield_prompt: string;
  batch_id: string;
  generation_status: string | null;
  media_url?: string | null;
}

interface FalResult {
  data?: { images?: Array<{ url: string }> };
  images?: Array<{ url: string }>;
}

interface GenerateResult {
  mediaId: string;
  slot: string;
  provider: string;
  success: boolean;
  url?: string;
  error?: string;
}

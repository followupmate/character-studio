import { NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

// Async reel-video pipeline — avoids the serverless timeout that kills long (3-4 min) video gens.
// One endpoint, called repeatedly by the client:
//   1st call (no active job)  → SUBMIT a fal.queue job, store its id, return {status:"generating"} fast.
//   next calls (active job)   → POLL fal.queue; when the video is done, for Kling add scene audio via
//                               a second mmaudio job; when everything is done, download → Supabase → ready.
// Job state is stored as JSON in chs_media.higgsfield_job_id under the key "falq".

const AUDIO_HINTS: Record<string, string> = {
  scene: "natural diegetic sounds only — fabric movement, soft breathing, ambient environment, no background music",
  ambient: "subtle ambient background music matching the mood",
  dialogue: "clear foreground voice and natural room tone, no music",
  silent: "",
};

interface FalQState {
  falq: true;
  model: string;       // fal endpoint id currently running
  requestId: string;
  phase: "video" | "audio";
  audioStyle: string;
  needsAudio: boolean; // kling + non-silent → run mmaudio after video
}

function clean(p: string): string {
  return p
    .replace(/^Model:\s*(?:Soul\s*\d+|Seedance\s*\S*)\s*[^\n]*?(?:Video\s*Prompt|Image\s*Prompt)?[\s:]*/i, "")
    .replace(/^(?:Video|Image)\s*Prompt[\s:]*/i, "")
    .trim();
}

function parseState(raw: string | null): FalQState | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j && j.falq ? (j as FalQState) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const falApiKey = process.env.FAL_API_KEY;
  if (!falApiKey) return NextResponse.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  fal.config({ credentials: falApiKey });

  try {
    const { mediaId, model = "kling", audioStyle = "scene", promptOverride } = (await req.json()) as {
      mediaId?: string;
      model?: string;
      audioStyle?: "scene" | "ambient" | "dialogue" | "silent";
      promptOverride?: string;
    };
    if (!mediaId) return NextResponse.json({ error: "mediaId is required" }, { status: 400 });

    const { data: media, error } = await supabase
      .from("chs_media")
      .select("id, slot, batch_id, higgsfield_prompt, higgsfield_job_id, media_url")
      .eq("id", mediaId)
      .single();
    if (error || !media) return NextResponse.json({ error: "Media not found" }, { status: 404 });

    const state = parseState(media.higgsfield_job_id);

    // ── POLL an existing job ───────────────────────────────────
    if (state) {
      const status = await fal.queue.status(state.model, { requestId: state.requestId });
      const s = (status as { status?: string }).status;

      if (s !== "COMPLETED") {
        return NextResponse.json({ status: "generating", phase: state.phase });
      }

      const result = await fal.queue.result(state.model, { requestId: state.requestId });
      const outUrl =
        (result as { data?: { video?: { url?: string } } })?.data?.video?.url ??
        (result as { video?: { url?: string } })?.video?.url;
      if (!outUrl) throw new Error("fal result has no video url");

      // Kling video done but still needs audio → submit mmaudio as a second job.
      if (state.phase === "video" && state.needsAudio) {
        const sub = await fal.queue.submit("fal-ai/mmaudio-v2", {
          input: { video_url: outUrl, prompt: AUDIO_HINTS[state.audioStyle] ?? AUDIO_HINTS.scene, num_steps: 25 },
        });
        const newState: FalQState = { ...state, model: "fal-ai/mmaudio-v2", requestId: (sub as { request_id: string }).request_id, phase: "audio" };
        await supabase.from("chs_media").update({ higgsfield_job_id: JSON.stringify(newState) }).eq("id", mediaId);
        return NextResponse.json({ status: "generating", phase: "audio" });
      }

      // Final video ready → download + upload to Supabase Storage.
      const vid = await fetch(outUrl);
      if (!vid.ok) throw new Error(`download failed ${vid.status}`);
      const buf = Buffer.from(await vid.arrayBuffer());
      const storagePath = `videos/${mediaId}.mp4`;
      const { error: upErr } = await supabase.storage
        .from("character-media")
        .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
      if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
      const { data: pub } = supabase.storage.from("character-media").getPublicUrl(storagePath);
      const finalUrl = `${pub.publicUrl}?t=${Date.now()}`;

      await supabase
        .from("chs_media")
        .update({ media_url: finalUrl, source_url: finalUrl, generation_status: "completed", status: "ready", higgsfield_job_id: null, last_error: null })
        .eq("id", mediaId);

      return NextResponse.json({ status: "ready", url: finalUrl });
    }

    // ── SUBMIT a new job ───────────────────────────────────────
    // Look up the start frame from the same batch (image-to-video anchor).
    let startFrameUrl: string | null = null;
    const { data: sf } = await supabase
      .from("chs_media")
      .select("media_url")
      .eq("batch_id", media.batch_id)
      .eq("slot", "reel_start_frame")
      .single();
    if (sf?.media_url) startFrameUrl = sf.media_url;

    // Persist an edited prompt (regenerate flow) so it's used + kept for future runs.
    if (promptOverride?.trim() && promptOverride.trim() !== media.higgsfield_prompt) {
      await supabase.from("chs_media").update({ higgsfield_prompt: promptOverride.trim() }).eq("id", mediaId);
    }
    const prompt = clean((promptOverride?.trim() || media.higgsfield_prompt || ""));
    const cinematic = `Cinematic 9:16 vertical video. Real person. Natural movement. ${prompt}`;

    let falModel: string;
    let input: Record<string, unknown>;
    let needsAudio = false;

    if (model === "kling") {
      falModel = startFrameUrl ? "fal-ai/kling-video/v2.1/pro/image-to-video" : "fal-ai/kling-video/v2.1/pro/text-to-video";
      input = { prompt: cinematic, duration: "10", aspect_ratio: "9:16", ...(startFrameUrl ? { image_url: startFrameUrl } : {}) };
      needsAudio = audioStyle !== "silent"; // Kling has no native audio → mmaudio after
    } else if (model === "seedance-fast" || model === "seedance-i2v") {
      // Identity holds ONLY if the start frame clearly shows her face (see archetypeDeck reel_start_frame).
      // Explicit 9:16 (not "auto", which can reframe/crop the face) + highest resolution the tier allows.
      if (!startFrameUrl) return NextResponse.json({ error: "Seedance i2v needs a start frame" }, { status: 422 });
      const fast = model === "seedance-fast";
      falModel = fast ? "bytedance/seedance-2.0/fast/image-to-video" : "bytedance/seedance-2.0/image-to-video";
      input = { prompt: cinematic, image_url: startFrameUrl, resolution: fast ? "720p" : "1080p", duration: "5", aspect_ratio: "9:16", generate_audio: audioStyle !== "silent" };
    } else if (model === "seedance-ref") {
      falModel = "bytedance/seedance-2.0/reference-to-video";
      const images = startFrameUrl ? [startFrameUrl] : [];
      input = { prompt: `@Image1 ${prompt}`, image_urls: images, resolution: "1080p", duration: "5", aspect_ratio: "9:16", generate_audio: audioStyle !== "silent" };
    } else {
      return NextResponse.json({ error: `Unsupported async video model: ${model}` }, { status: 400 });
    }

    const sub = await fal.queue.submit(falModel, { input });
    const newState: FalQState = {
      falq: true,
      model: falModel,
      requestId: (sub as { request_id: string }).request_id,
      phase: "video",
      audioStyle,
      needsAudio,
    };
    await supabase
      .from("chs_media")
      .update({ generation_status: "generating", last_error: null, higgsfield_job_id: JSON.stringify(newState) })
      .eq("id", mediaId);

    return NextResponse.json({ status: "generating", phase: "video", submitted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[video-async]", msg);
    return NextResponse.json({ status: "error", error: msg.slice(0, 400) }, { status: 500 });
  }
}

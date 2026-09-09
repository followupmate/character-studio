import { supabase } from "@/lib/supabase";
import { stripPromptHeader } from "@/lib/promptClean";

// Shared Higgsfield Soul V2 image generation (Cloud API, platform.higgsfield.ai).
// Used by the in-app Higgsfield button AND as the preferred fallback in generate-media when Google
// Nano Banana blocks intimate/suggestive content (Google → Higgsfield → fal LoRA).
//
// Model `higgsfield-ai/soul/v2/standard` + enhance_prompt:false (enhance dilutes the trained identity).
// Requires HIGGSFIELD_API_KEY = "KEY_ID:KEY_SECRET". Returns a public Supabase Storage URL.

const BASE = "https://platform.higgsfield.ai";
const SOUL_MODEL = "higgsfield-ai/soul/v2/standard";
export const FALLBACK_SOUL_ID = "43d6e73e-f0ac-4f22-a82b-f5819f15367f";

export function soulConfigured(): boolean {
  const c = process.env.HIGGSFIELD_API_KEY;
  return !!c && c.includes(":");
}

// Item 11 — distinguishes WHY a Higgsfield call failed so callers can surface a clear, specific
// banner instead of letting an invalid-credential 401/403 get buried among N generic per-shot
// errors. Pure/deterministic — no network — so it's unit-testable without hitting the provider.
// A MISSING credential is a separate, already-distinct case (soulConfigured()/the early
// `!credentials` guard in generateSoulImage() below) — this function only classifies failures
// that reached the provider, i.e. a credential was present but the provider rejected/flagged it.
export type HiggsfieldFailureKind = "invalid_credential" | "nsfw" | "other";

export function classifyHiggsfieldFailure(submitStatus?: number, jobStatus?: string): HiggsfieldFailureKind {
  if (submitStatus === 401 || submitStatus === 403) return "invalid_credential";
  if (jobStatus === "nsfw") return "nsfw";
  return "other";
}



/**
 * A Soul job that outlived the caller's poll budget, parked on chs_media.higgsfield_job_id so the
 * NEXT call resumes it instead of paying for a new one.
 *
 * Higgsfield's queue can exceed any budget a 300s serverless function can offer — VHD #2's start
 * frame was still "queued" after 250s of polling. Before this, every retry submitted a fresh job
 * and spent another credit while the previous one quietly completed with nobody listening. Three
 * credits went that way on 2026-09-09.
 *
 * `soul: true` is the discriminator, mirroring video-async's `falq: true` on the same column, so
 * the two job kinds cannot read each other's state.
 */
export interface SoulJobState {
  soul: true;
  status_url: string;
  submitted_at: string;
}

export function parseSoulJobState(raw: string | null | undefined): SoulJobState | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return j && j.soul === true && typeof j.status_url === "string" ? (j as SoulJobState) : null;
  } catch {
    return null;
  }
}

/** 60 x 2.5s = 150s. The default, sized for a POOLED call where several slots share one
 *  maxDuration=300 budget and no single stuck slot may eat all of it. */
export const SOUL_POLL_ATTEMPTS_POOLED = 60;

/** 100 x 2.5s = 250s. For a call generating ONE slot, where the whole function budget belongs to
 *  it and the only thing a smaller number buys is giving up earlier. */
export const SOUL_POLL_ATTEMPTS_SINGLE = 100;

export async function generateSoulImage(opts: {
  prompt: string;
  negativePrompt?: string; // F0.5 — optional negative prompt
  soulId: string;
  aspect: string; // "9:16" | "3:4" | "1:1"
  mediaId: string;
  /** How long to wait for Higgsfield's queue. See the two constants above. */
  maxPollAttempts?: number;
  /** Raw chs_media.higgsfield_job_id. When it holds a Soul job, that job is resumed. */
  resumeJobState?: string | null;
  /** Persist the parked job so a later call can resume it. */
  onJobSubmitted?: (state: SoulJobState) => Promise<void>;
  /** Clear the parked job — the work is finished, one way or the other. */
  onJobSettled?: () => Promise<void>;
}): Promise<string> {
  const credentials = process.env.HIGGSFIELD_API_KEY;
  if (!credentials || !credentials.includes(":")) throw new Error("HIGGSFIELD_API_KEY not configured");
  const auth = `Key ${credentials}`;

  // F0.5 — build request body with optional negative_prompt field
  const requestBody: Record<string, unknown> = {
    prompt: stripPromptHeader(opts.prompt),
    aspect_ratio: opts.aspect,
    resolution: "1080p",
    enhance_prompt: false,
    custom_reference_id: opts.soulId,
  };

  // Include negative prompt if provided (Higgsfield Soul V2 API accepts it)
  if (opts.negativePrompt) {
    requestBody.negative_prompt = opts.negativePrompt;
  }

  type SoulJob = { status?: string; status_url?: string; images?: Array<{ url?: string }>; detail?: unknown };
  let job: SoulJob;

  // RESUME an unfinished job from a previous call before submitting anything. A Higgsfield job that
  // outlived its caller keeps running and keeps costing; picking it back up is free, and submitting
  // over the top of it is the expensive mistake this branch exists to stop.
  const resumed = parseSoulJobState(opts.resumeJobState);
  if (resumed) {
    job = (await fetch(resumed.status_url, { headers: { Authorization: auth } }).then((r) => r.json())) as SoulJob;
    job.status_url = job.status_url ?? resumed.status_url;
  } else {
    const submit = await fetch(`${BASE}/${SOUL_MODEL}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    job = (await submit.json().catch(() => ({}))) as SoulJob;
    if (!submit.ok) {
    // Item 11 — distinctly-prefixed message when the failure classifies as an invalid credential,
    // so app/api/fanvue/generate-media/route.ts can grep for it and surface one clear banner
    // instead of a generic per-shot error.
      const kind = classifyHiggsfieldFailure(submit.status);
      const prefix = kind === "invalid_credential" ? "Higgsfield credential invalid" : "Higgsfield submit";
      throw new Error(`${prefix} (${submit.status}): ${JSON.stringify(job).slice(0, 200)}`);
    }
    // Park the job the moment it is accepted, BEFORE polling. If this function dies mid-poll — and
    // it does, that is the whole problem — the next call still knows what to resume.
    if (job.status_url) {
      await opts.onJobSubmitted?.({ soul: true, status_url: job.status_url, submitted_at: new Date().toISOString() });
    }
  }

  // Production finding (app/api/characters/generate-higgsfield/route.ts hit the same thing): the job
  // can legitimately sit "queued" on Higgsfield's side past 112.5s during their busier periods — not
  // a bug here. Callers of this function share a wider budget across multiple slots per invocation
  // (app/api/characters/generate-media/route.ts runs at maxDuration=300 with several slots in a
  // pool), so this stays a smaller bump than the single-purpose route's — enough extra headroom to
  // absorb a slow queue without one stuck slot eating the whole shared budget.
  //
  // 2026-09-09: VHD #1's start frame failed TWICE at exactly this ceiling — submit returned 200
  // with a status_url both times and the job was still "queued" after all 60 polls, so two
  // Higgsfield credits were spent on images this process never collected. The fix is not a blanket
  // increase, which would resurrect the shared-budget problem the comment above describes: instead
  // the caller says whether it owns the whole function budget, and a single-slot generation waits
  // the ~250s it actually has rather than giving up at 150s with 150s still on the clock.
  const maxPolls = opts.maxPollAttempts ?? SOUL_POLL_ATTEMPTS_POOLED;
  for (let i = 0; i < maxPolls && !["completed", "failed", "nsfw"].includes(job.status ?? ""); i++) {
    if (!job.status_url) break;
    await new Promise((r) => setTimeout(r, 2500));
    job = await (await fetch(job.status_url, { headers: { Authorization: auth } })).json();
  }
  if (classifyHiggsfieldFailure(undefined, job.status) === "nsfw") {
    await opts.onJobSettled?.();
    throw new Error("Higgsfield flagged NSFW");
  }
  const srcUrl = job.images?.[0]?.url;
  if (!srcUrl) {
    // Deliberately does NOT clear the parked state: the job is still running on their side, and the
    // next call should resume it rather than buy another one.
    const stillQueued = !["completed", "failed"].includes(job.status ?? "");
    if (!stillQueued) await opts.onJobSettled?.();
    throw new Error(
      `Higgsfield: no image (status ${job.status ?? "unknown"})` +
        (stillQueued ? " — job left running, call again to resume it without resubmitting" : "")
    );
  }
  await opts.onJobSettled?.();

  const img = await fetch(srcUrl);
  if (!img.ok) throw new Error(`Higgsfield download failed ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const path = `media/${opts.mediaId}.png`;
  const { error } = await supabase.storage.from("character-media").upload(path, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Higgsfield storage upload: ${error.message}`);
  const { data: pub } = supabase.storage.from("character-media").getPublicUrl(path);
  return pub.publicUrl;
}

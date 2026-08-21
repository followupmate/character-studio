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



export async function generateSoulImage(opts: {
  prompt: string;
  negativePrompt?: string; // F0.5 — optional negative prompt
  soulId: string;
  aspect: string; // "9:16" | "3:4" | "1:1"
  mediaId: string;
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

  const submit = await fetch(`${BASE}/${SOUL_MODEL}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  let job = (await submit.json().catch(() => ({}))) as {
    status?: string; status_url?: string; images?: Array<{ url?: string }>; detail?: unknown;
  };
  if (!submit.ok) {
    // Item 11 — distinctly-prefixed message when the failure classifies as an invalid credential,
    // so app/api/fanvue/generate-media/route.ts can grep for it and surface one clear banner
    // instead of a generic per-shot error.
    const kind = classifyHiggsfieldFailure(submit.status);
    const prefix = kind === "invalid_credential" ? "Higgsfield credential invalid" : "Higgsfield submit";
    throw new Error(`${prefix} (${submit.status}): ${JSON.stringify(job).slice(0, 200)}`);
  }

  // Production finding (app/api/characters/generate-higgsfield/route.ts hit the same thing): the job
  // can legitimately sit "queued" on Higgsfield's side past 112.5s during their busier periods — not
  // a bug here. Callers of this function share a wider budget across multiple slots per invocation
  // (app/api/characters/generate-media/route.ts runs at maxDuration=300 with several slots in a
  // pool), so this stays a smaller bump than the single-purpose route's — enough extra headroom to
  // absorb a slow queue without one stuck slot eating the whole shared budget.
  for (let i = 0; i < 60 && !["completed", "failed", "nsfw"].includes(job.status ?? ""); i++) {
    if (!job.status_url) break;
    await new Promise((r) => setTimeout(r, 2500));
    job = await (await fetch(job.status_url, { headers: { Authorization: auth } })).json();
  }
  if (classifyHiggsfieldFailure(undefined, job.status) === "nsfw") throw new Error("Higgsfield flagged NSFW");
  const srcUrl = job.images?.[0]?.url;
  if (!srcUrl) throw new Error(`Higgsfield: no image (status ${job.status ?? "unknown"})`);

  const img = await fetch(srcUrl);
  if (!img.ok) throw new Error(`Higgsfield download failed ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const path = `media/${opts.mediaId}.png`;
  const { error } = await supabase.storage.from("character-media").upload(path, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Higgsfield storage upload: ${error.message}`);
  const { data: pub } = supabase.storage.from("character-media").getPublicUrl(path);
  return pub.publicUrl;
}

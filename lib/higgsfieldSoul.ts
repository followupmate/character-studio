import { supabase } from "@/lib/supabase";

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

function cleanForSoul(raw: string): string {
  return raw
    .replace(/^Model:\s*Soul\s*\d+\s*[^\n]*?(Image\s*Prompt)?[\s:]*/i, "")
    .replace(/^Image\s*Prompt[\s:]*/i, "")
    .replace(/^[\s🖤🖼️]+/, "")
    .trim();
}

export async function generateSoulImage(opts: {
  prompt: string;
  soulId: string;
  aspect: string; // "9:16" | "3:4" | "1:1"
  mediaId: string;
}): Promise<string> {
  const credentials = process.env.HIGGSFIELD_API_KEY;
  if (!credentials || !credentials.includes(":")) throw new Error("HIGGSFIELD_API_KEY not configured");
  const auth = `Key ${credentials}`;

  const submit = await fetch(`${BASE}/${SOUL_MODEL}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: cleanForSoul(opts.prompt),
      aspect_ratio: opts.aspect,
      resolution: "1080p",
      enhance_prompt: false,
      custom_reference_id: opts.soulId,
    }),
  });
  let job = (await submit.json().catch(() => ({}))) as {
    status?: string; status_url?: string; images?: Array<{ url?: string }>; detail?: unknown;
  };
  if (!submit.ok) throw new Error(`Higgsfield submit ${submit.status}: ${JSON.stringify(job).slice(0, 200)}`);

  for (let i = 0; i < 45 && !["completed", "failed", "nsfw"].includes(job.status ?? ""); i++) {
    if (!job.status_url) break;
    await new Promise((r) => setTimeout(r, 2500));
    job = await (await fetch(job.status_url, { headers: { Authorization: auth } })).json();
  }
  if (job.status === "nsfw") throw new Error("Higgsfield flagged NSFW");
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

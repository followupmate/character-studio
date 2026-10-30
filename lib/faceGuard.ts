// REEL FACE GUARD (flag: reel_face_guard_v1, default OFF; env REEL_FACE_GUARD=true/false wins).
// Incident 2026-10-30: the reel_start_frame was a neck-down body shot (archetype over_shoulder),
// Kling had no face to animate from and invented a different woman at 4–8 s. Three layers:
//  (a) prompt: reel_start_frame never uses body-only archetypes; face clause + cropped-head negatives
//  (b) before Kling: vision check that the start frame shows her face (regen once, else block + flag)
//  (c) after Kling: identity check of the 4 s and 7.5 s frames vs the character reference (hold + flag)
import { anthropic } from "@/lib/anthropic";

export const REEL_START_FACE_CLAUSE =
  "Framed chest-up or waist-up: her head, full face and shoulders are inside the frame, face sharp and clearly visible (front or three-quarter view), eyes visible.";

export const REEL_START_FACE_NEGATIVES =
  "cropped head, head out of frame, face cut off, headless, neck-down crop, body-only shot, back view, face hidden, face turned away";

export function faceGuardEnabled(flagOn: boolean): boolean {
  const env = process.env.REEL_FACE_GUARD;
  if (env === "true") return true;
  if (env === "false") return false;
  return flagOn;
}

const VISION_MODEL = process.env.FACE_GUARD_MODEL || "claude-sonnet-4-5";

async function imageBlock(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`face-guard fetch ${r.status}`);
  const ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
  const media_type = (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(ct) ? ct : "image/jpeg") as
    "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  return { type: "image" as const, source: { type: "base64" as const, media_type, data: Buffer.from(await r.arrayBuffer()).toString("base64") } };
}

async function askJson<T>(content: unknown[]): Promise<T> {
  const res = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 300,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: "user", content: content as any }],
  });
  const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`face-guard: no JSON in reply: ${text.slice(0, 120)}`);
  return JSON.parse(m[0]) as T;
}

export type FaceVisibleResult = { ok: boolean; face_visible: boolean; face_fraction: number; reason: string };

/** (b) Is the woman's face fully inside the frame and clearly visible? */
export async function checkStartFrameFace(url: string): Promise<FaceVisibleResult> {
  const r = await askJson<{ face_visible: boolean; face_fraction: number; reason: string }>([
    await imageBlock(url),
    { type: "text", text: 'This is the first frame of a vertical video. Is the woman\'s whole face (forehead to chin, both eyes) inside the frame and clearly visible, front or three-quarter view? Estimate the face height as a fraction of the image height. Reply ONLY JSON: {"face_visible":true|false,"face_fraction":0.0,"reason":"..."}' },
  ]);
  const ok = !!r.face_visible && (r.face_fraction ?? 0) >= 0.06;
  return { ok, face_visible: !!r.face_visible, face_fraction: r.face_fraction ?? 0, reason: r.reason ?? "" };
}

export type IdentityResult = { ok: boolean; scores: number[]; reason: string };

/** (c) Do the given video frames show the same woman as the reference? score 0–10, pass >= threshold on every frame. */
export async function checkIdentityMatch(referenceUrl: string, frames: Buffer[], threshold = 7): Promise<IdentityResult> {
  const content: unknown[] = [{ type: "text", text: "Image 1 is the identity reference of the character." }, await imageBlock(referenceUrl)];
  frames.forEach((f, i) => {
    content.push({ type: "text", text: `Frame ${i + 1} from a generated video:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.toString("base64") } });
  });
  content.push({ type: "text", text: 'For each video frame, rate 0-10 how confidently the woman is the SAME person as the reference (face shape, eyes, nose, lips, hair colour). 0 if no face visible. Reply ONLY JSON: {"scores":[n,...],"reason":"..."}' });
  const r = await askJson<{ scores: number[]; reason: string }>(content);
  const scores = Array.isArray(r.scores) ? r.scores.map(Number) : [];
  const ok = scores.length === frames.length && scores.every((s) => s >= threshold);
  return { ok, scores, reason: r.reason ?? "" };
}

/** Extract JPEG frames at the given seconds from a video buffer (ffmpeg-static). */
export async function extractFrames(video: Buffer, seconds: number[]): Promise<Buffer[]> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { resolveFfmpegPath, runFfmpeg } = await import("@/lib/video/hookOverlay");
  const bin = await resolveFfmpegPath();
  if (!bin) throw new Error("ffmpeg binary not found");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "faceguard-"));
  try {
    const input = path.join(dir, "in.mp4");
    await fs.writeFile(input, video);
    const out: Buffer[] = [];
    for (const [i, s] of seconds.entries()) {
      const f = path.join(dir, `f${i}.jpg`);
      // -sseof fallback is not needed: clips are 8 s; clamp handled by caller.
      await runFfmpeg(bin, ["-y", "-ss", String(s), "-i", input, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "4", f], 30_000);
      out.push(await fs.readFile(f));
    }
    return out;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

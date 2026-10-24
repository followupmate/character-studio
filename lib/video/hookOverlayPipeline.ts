/**
 * Buffer-in / buffer-out wrapper used by app/api/characters/video-async/route.ts.
 *
 * Failure policy (decided in Phase 2, see README):
 *   - the hook TEXT fails validation (typo, banned term, missing glyph, too long) -> "needs_review":
 *     the caller holds the reel (media_url stays empty) because publishing wrong words is worse than
 *     publishing late;
 *   - anything else (ffmpeg missing, timeout, resvg/fontkit error, tmp disk) -> "render_failed": the
 *     caller publishes the raw video without overlay and logs. A missing overlay costs a little
 *     reach; it is not a content risk, and the raw reel is a complete, valid reel.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyHookOverlay, resolveFfmpegPath, runFfmpeg, stripEmoji } from "./hookOverlay";
import { validateHookText, type HookIssue } from "./hookTextValidator";

/** HOOK_OVERLAY_ENABLED=false is a kill switch, =true forces on, otherwise the character flag decides. */
export function hookOverlayEnabled(flagOn: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const e = env.HOOK_OVERLAY_ENABLED;
  if (e === "false") return false;
  return e === "true" || flagOn;
}

export type OverlayOutcome =
  | { kind: "applied"; video: Buffer; cover: Buffer | null; hookText: string; ms: number; endCard?: "applied" | "skipped"; endDetail?: string }
  | { kind: "needs_review"; issues: HookIssue[]; hookText: string }
  | { kind: "render_failed"; error: string };

export async function applyHookOverlayToBuffer(opts: {
  video: Buffer;
  hookText: string;
  ffmpegPath?: string;
  timeoutMs?: number;
  /** Seconds into the overlay clip to take the cover frame from (hook fully faded in). */
  coverAtSec?: number;
  makeCover?: boolean;
  /** Operator-approved override text (marker.experiment set) — relaxed word/char limits. */
  relaxed?: boolean;
  /** Recipe overlayPosition (marker.overlay_position); default top third. */
  position?: "top" | "lower";
  /** Optional end card (reel_hook_overrides.end_text). Invalid/unfit -> skipped, main overlay unaffected. */
  endText?: string;
}): Promise<OverlayOutcome> {
  const t0 = Date.now();
  let validation;
  try {
    validation = await validateHookText(opts.hookText, { relaxed: opts.relaxed === true, position: opts.position ?? "top" });
  } catch (e) {
    // dictionary / font could not even be loaded: infrastructure, not the text.
    return { kind: "render_failed", error: `validator unavailable: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
  if (!validation.ok) return { kind: "needs_review", issues: validation.issues, hookText: opts.hookText };

  // End card: emoji stripped (font has none), relaxed validation, lower third. Never blocks the reel.
  let endText: string | undefined;
  let endDetail: string | undefined;
  if (opts.endText) {
    const cleaned = stripEmoji(opts.endText);
    try {
      const ev = cleaned ? await validateHookText(cleaned, { relaxed: true, position: "lower" }) : null;
      if (ev?.ok) endText = ev.text;
      else endDetail = ev ? ev.issues.map((i) => `${i.code}${i.detail ? `(${i.detail})` : ""}`).join(", ") : "empty after emoji strip";
    } catch (e) {
      endDetail = `end validator: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  let dir: string | null = null;
  try {
    const bin = opts.ffmpegPath ?? (await resolveFfmpegPath());
    if (!bin) throw new Error("ffmpeg binary not found (ffmpeg-static / FFMPEG_PATH)");
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "hook-ov-"));
    const input = path.join(dir, "in.mp4");
    const output = path.join(dir, "out.mp4");
    await fs.writeFile(input, opts.video);
    const res = await applyHookOverlay({ inputVideo: input, output, text: validation.text, relaxed: opts.relaxed === true, position: opts.position ?? "top", ffmpegPath: bin, timeoutMs: opts.timeoutMs ?? 70_000, ...(endText ? { endText } : {}) });
    if (endText && !res.endCard) endDetail = "clip too short for end card";
    const video = await fs.readFile(output);
    if (video.length < 10_000) throw new Error(`overlay output suspiciously small (${video.length} bytes)`);

    let cover: Buffer | null = null;
    if (opts.makeCover !== false) {
      // The cover is a bonus: any failure here must not lose the overlay video.
      try {
        const coverPath = path.join(dir, "cover.jpg");
        await runFfmpeg(
          bin,
          ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(opts.coverAtSec ?? 1.2), "-i", output, "-frames:v", "1", "-q:v", "2", coverPath],
          20_000,
        );
        cover = await fs.readFile(coverPath);
      } catch (e) {
        console.warn("[hook-overlay] cover frame failed:", e instanceof Error ? e.message : e);
      }
    }
    const endCard = opts.endText ? { endCard: (res.endCard ? "applied" : "skipped") as "applied" | "skipped", ...(endDetail ? { endDetail } : {}) } : {};
    if (opts.endText && !res.endCard) console.warn(`[hook-overlay] end card skipped: ${endDetail ?? "unknown"}`);
    return { kind: "applied", video, cover, hookText: validation.text, ms: Date.now() - t0, ...endCard };
  } catch (e) {
    return { kind: "render_failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 400) };
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Hook overlay: render the hook text to a transparent 1080x1920 PNG (glyph
 * outlines from the bundled OFL font -> SVG paths -> @resvg/resvg-js) and burn
 * it into a video with ffmpeg-static (fade in/out via alpha fade).
 *
 * Why outlines instead of an <text> element / satori: spelling & glyphs were
 * already validated (hookTextValidator), the SVG has no font dependency at all
 * (resvg needs no fontconfig on Vercel) and the output is pixel-deterministic.
 *
 * NOT wired into video-async yet (Phase 1 spike).
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  HOOK_SPEC,
  layoutHook,
  linePathData,
  loadHookFont,
  type FontLike,
} from "./hookSpec";
import { validateHookText } from "./hookTextValidator";

/** Transparent-background SVG: soft top scrim + ivory outlined text. */
export function buildHookSvg(text: string, font: FontLike = loadHookFont()): string {
  const layout = layoutHook(font, text);
  if (!layout.ok) throw new Error(`hook layout failed: ${layout.reason}`);
  const { w, h } = HOOK_SPEC.canvas;
  const { scrim, color } = HOOK_SPEC;
  const paths = layout.lines
    .map((l) => `<path d="${linePathData(font, l)}" fill="${color}"/>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#000" stop-opacity="${scrim.opacityTop}"/>` +
    `<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="${w}" height="${scrim.height}" fill="url(#s)"/>` +
    paths +
    `</svg>`
  );
}

/** Render the overlay PNG (RGBA, 1080x1920). Throws if the text does not validate. */
export async function renderHookPng(rawText: string, font: FontLike = loadHookFont()): Promise<Buffer> {
  const v = await validateHookText(rawText, { font });
  if (!v.ok) throw new Error(`invalid hook text: ${v.issues.map((i) => `${i.code}${i.detail ? `(${i.detail})` : ""}`).join(", ")}`);
  const svg = buildHookSvg(v.text, font);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: HOOK_SPEC.canvas.w } }).render().asPng();
  return Buffer.from(png);
}

export type OverlayArgsInput = {
  inputVideo: string;
  overlayPng: string;
  output: string;
  /** Overlay start offset (s). Default 0. */
  startSec?: number;
};

/** ffmpeg argv (pure). Output: H.264 yuv420p, closed GOP, faststart, audio copied. */
export function buildOverlayFfmpegArgs(i: OverlayArgsInput): string[] {
  const t = HOOK_SPEC.timing;
  const start = i.startSec ?? 0;
  const filter =
    `[1:v]format=rgba,` +
    `fade=t=in:st=0:d=${t.fadeIn}:alpha=1,` +
    `fade=t=out:st=${(t.fadeOutStart - 0).toFixed(2)}:d=${t.fadeOut}:alpha=1,` +
    `setpts=PTS+${start}/TB[ov];` +
    `[0:v][ov]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`;
  return [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", i.inputVideo,
    "-loop", "1", "-t", String(t.total), "-i", i.overlayPng,
    "-filter_complex", filter,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-x264-params", "open-gop=0",
    "-c:a", "copy",
    "-movflags", "+faststart",
    i.output,
  ];
}

/** Path of the bundled ffmpeg binary (ffmpeg-static), or null if unavailable. */
export async function resolveFfmpegPath(): Promise<string | null> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default: string | null };
    return mod.default ?? null;
  } catch {
    return null;
  }
}

export function runFfmpeg(bin: string, args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-400)}`));
    });
  });
}

/** End-to-end: validate -> PNG -> ffmpeg. Files live in os.tmpdir() (Vercel: /tmp). */
export async function applyHookOverlay(opts: {
  inputVideo: string;
  output: string;
  text: string;
  startSec?: number;
  ffmpegPath?: string;
  /** Also keep the overlay PNG here (debug/QA). */
  keepPngAt?: string;
  /** Hard ffmpeg timeout (ms). Default 120 s. */
  timeoutMs?: number;
}): Promise<{ ffmpegPath: string }> {
  const bin = opts.ffmpegPath ?? (await resolveFfmpegPath());
  if (!bin) throw new Error("ffmpeg binary not found (ffmpeg-static / FFMPEG_PATH)");
  const png = await renderHookPng(opts.text);
  const pngPath = opts.keepPngAt ?? path.join(os.tmpdir(), `hook-${process.pid}-${Date.now()}.png`);
  await fs.writeFile(pngPath, png);
  try {
    await runFfmpeg(
      bin,
      buildOverlayFfmpegArgs({ inputVideo: opts.inputVideo, overlayPng: pngPath, output: opts.output, startSec: opts.startSec }),
      opts.timeoutMs,
    );
  } finally {
    if (!opts.keepPngAt) await fs.rm(pngPath, { force: true });
  }
  return { ffmpegPath: bin };
}

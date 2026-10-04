import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  applyHookOverlay,
  buildHookSvg,
  buildOverlayFfmpegArgs,
  renderHookPng,
  resolveFfmpegPath,
} from "./hookOverlay";
import { HOOK_SPEC, bboxInSafeZone, layoutHook, loadHookFont, measureText, wrapHook } from "./hookSpec";

const font = loadHookFont();

describe("hookSpec layout", () => {
  it("measures wider text as wider", () => {
    expect(measureText(font, "Tell me you\u2019d stay")).toBeGreaterThan(measureText(font, "Tell me"));
  });

  it("wraps long hooks into 2 balanced lines within max width", () => {
    const lines = wrapHook(font, "Slow mornings, quiet city lights");
    expect(Array.isArray(lines)).toBe(true);
    for (const l of lines as string[]) expect(measureText(font, l)).toBeLessThanOrEqual(HOOK_SPEC.maxLineWidthPx);
  });

  it("keeps a short hook on one line and inside the safe zone", () => {
    const l = layoutHook(font, "Tell me you\u2019d stay");
    expect(l.ok).toBe(true);
    if (l.ok) {
      expect(l.lines).toHaveLength(1);
      expect(bboxInSafeZone(l.bbox)).toBe(true);
      // centred
      expect(l.lines[0].x + l.lines[0].width / 2).toBeCloseTo(540, 3);
    }
  });

  it("reports too_many_lines / word_too_wide", () => {
    expect(wrapHook(font, "Wonderful wonderful wonderful wonderful wonderful")).toBe("too_many_lines");
    expect(wrapHook(font, "Supercalifragilisticexpialidocious Supercalifragilisticexpialidocious")).toBe("word_too_wide");
  });
});

describe("buildHookSvg", () => {
  it("is deterministic, 1080x1920, outline paths only (no <text>)", () => {
    const a = buildHookSvg("Tell me you\u2019d stay", font);
    expect(a).toBe(buildHookSvg("Tell me you\u2019d stay", font));
    expect(a).toContain('width="1080"');
    expect(a).toContain('height="1920"');
    expect(a).toContain("#F5F0E6");
    expect(a).not.toContain("<text");
  });
});

describe("renderHookPng", () => {
  it("renders a 1080x1920 RGBA PNG with transparent areas and ivory pixels", async () => {
    const png = await renderHookPng("Tell me you'd stay");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1920);
    expect(png[25]).toBe(6); // colour type 6 = RGBA
    expect(png.length).toBeGreaterThan(5_000);
  });

  it("refuses invalid hook text (typo)", async () => {
    await expect(renderHookPng("Tell me you wuld stay")).rejects.toThrow(/misspelled/);
  });

  it("refuses banned text", async () => {
    await expect(renderHookPng("Link in bio")).rejects.toThrow(/banned_term/);
  });
});

describe("buildOverlayFfmpegArgs", () => {
  const args = buildOverlayFfmpegArgs({ inputVideo: "in.mp4", overlayPng: "o.png", output: "out.mp4" });
  const joined = args.join(" ");
  it("has IG-safe encode flags", () => {
    expect(joined).toContain("-pix_fmt yuv420p");
    expect(joined).toContain("-x264-params open-gop=0");
    expect(joined).toContain("-movflags +faststart");
    expect(joined).toContain("-c:v libx264");
  });
  it("fades the overlay in (0.25s) and out (0.35s) on alpha", () => {
    expect(joined).toContain("fade=t=in:st=0:d=0.25:alpha=1");
    expect(joined).toContain("fade=t=out:st=2.85:d=0.35:alpha=1");
    expect(joined).toContain("eof_action=pass");
  });
  it("keeps the audio track untouched and ends with the output path", () => {
    expect(joined).toContain("-map 0:a?");
    expect(joined).toContain("-c:a copy");
    expect(args[args.length - 1]).toBe("out.mp4");
  });
});

// Integration: only when a real ffmpeg is available (ffmpeg-static / FFMPEG_PATH).
const ffmpegPromise = resolveFfmpegPath();
describe("applyHookOverlay (integration, needs ffmpeg)", () => {
  it("burns the hook into a 1080x1920 mp4 and keeps the format", async (ctx) => {
    const bin = await ffmpegPromise;
    if (!bin || !fs.existsSync(bin)) return ctx.skip();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-it-"));
    const src = path.join(dir, "src.mp4");
    const out = path.join(dir, "out.mp4");
    const gen = spawnSync(bin, [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=0x8a7d6e:s=1080x1920:r=30:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src,
    ]);
    expect(gen.status).toBe(0);
    await applyHookOverlay({ inputVideo: src, output: out, text: "Tell me you'd stay", ffmpegPath: bin });
    expect(fs.statSync(out).size).toBeGreaterThan(10_000);
    const probe = spawnSync(bin, ["-hide_banner", "-i", out], { encoding: "utf8" });
    expect(probe.stderr).toMatch(/Video: h264.*yuv420p.*1080x1920/);
    expect(probe.stderr).toMatch(/Audio: aac/);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});

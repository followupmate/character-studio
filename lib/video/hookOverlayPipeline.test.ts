import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { applyHookOverlayToBuffer, hookOverlayEnabled } from "./hookOverlayPipeline";
import { resolveFfmpegPath } from "./hookOverlay";

describe("hookOverlayEnabled", () => {
  it("default off; character flag turns it on; env true forces on; env false is a kill switch", () => {
    expect(hookOverlayEnabled(false, {})).toBe(false);
    expect(hookOverlayEnabled(true, {})).toBe(true);
    expect(hookOverlayEnabled(false, { HOOK_OVERLAY_ENABLED: "true" } as never)).toBe(true);
    expect(hookOverlayEnabled(true, { HOOK_OVERLAY_ENABLED: "false" } as never)).toBe(false);
    expect(hookOverlayEnabled(false, { HOOK_OVERLAY_ENABLED: "1" } as never)).toBe(false);
  });
});

describe("applyHookOverlayToBuffer failure policy", () => {
  it("invalid hook TEXT -> needs_review (never reaches ffmpeg)", async () => {
    for (const bad of ["Link in bio", "tell me you wuld stay", "one two three four five six seven", "go → now"]) {
      const r = await applyHookOverlayToBuffer({ video: Buffer.from("x"), hookText: bad, ffmpegPath: "/definitely/not/ffmpeg" });
      expect(r.kind, bad).toBe("needs_review");
      if (r.kind === "needs_review") expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it("valid text but broken ffmpeg -> render_failed (caller publishes raw)", async () => {
    const r = await applyHookOverlayToBuffer({ video: Buffer.from("not a video"), hookText: "how’s the fit", ffmpegPath: "/definitely/not/ffmpeg" });
    expect(r.kind).toBe("render_failed");
  });

  it("valid text but garbage input video -> render_failed, temp dir cleaned", async () => {
    const bin = await resolveFfmpegPath();
    if (!bin || !fs.existsSync(bin)) return;
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("hook-ov-")).length;
    const r = await applyHookOverlayToBuffer({ video: Buffer.from("not a video"), hookText: "how’s the fit", ffmpegPath: bin });
    expect(r.kind).toBe("render_failed");
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("hook-ov-")).length;
    expect(after).toBe(before);
  });
});

describe("applyHookOverlayToBuffer (integration, needs ffmpeg)", () => {
  it("returns overlay mp4 + cover jpeg for a real 1080x1920 clip", async (ctx) => {
    const bin = await resolveFfmpegPath();
    if (!bin || !fs.existsSync(bin)) return ctx.skip();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-pipe-"));
    const src = path.join(dir, "src.mp4");
    const gen = spawnSync(bin, [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "color=c=0x8a7d6e:s=1080x1920:r=30:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src,
    ]);
    expect(gen.status).toBe(0);
    const r = await applyHookOverlayToBuffer({ video: fs.readFileSync(src), hookText: "grwm loading…", ffmpegPath: bin });
    expect(r.kind).toBe("applied");
    if (r.kind === "applied") {
      expect(r.video.length).toBeGreaterThan(10_000);
      expect(r.cover?.subarray(0, 3).toString("hex")).toBe("ffd8ff"); // JPEG magic
      expect(r.hookText).toBe("grwm loading…");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }, 60_000);
});

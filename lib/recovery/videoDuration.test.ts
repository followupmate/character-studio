import { describe, it, expect } from "vitest";
import { evaluateDurationGate, parseMvhdDuration } from "@/lib/recovery/videoDuration";
import { REEL_DURATION_GATE } from "@/lib/recovery/simpleReelCompiler";

// Synthesise the bytes an MP4 mvhd box actually contains, so the parser is tested against the
// real layout rather than a mock of itself.
function mvhdV0(timescale: number, duration: number, leadingNoise = 32): Uint8Array {
  const buf = new Uint8Array(leadingNoise + 4 + 4 + 8 + 8 + 16);
  const view = new DataView(buf.buffer);
  let p = leadingNoise;
  buf.set([0x6d, 0x76, 0x68, 0x64], p); // "mvhd"
  p += 4;
  view.setUint8(p, 0); // version 0
  p += 4; // version + flags
  view.setUint32(p, 0); // creation
  view.setUint32(p + 4, 0); // modification
  view.setUint32(p + 8, timescale);
  view.setUint32(p + 12, duration);
  return buf;
}

function mvhdV1(timescale: number, duration: number, leadingNoise = 16): Uint8Array {
  const buf = new Uint8Array(leadingNoise + 4 + 4 + 16 + 12 + 16);
  const view = new DataView(buf.buffer);
  let p = leadingNoise;
  buf.set([0x6d, 0x76, 0x68, 0x64], p);
  p += 4;
  view.setUint8(p, 1); // version 1
  p += 4;
  view.setUint32(p, 0); view.setUint32(p + 4, 0); // creation (64-bit)
  view.setUint32(p + 8, 0); view.setUint32(p + 12, 0); // modification (64-bit)
  view.setUint32(p + 16, timescale);
  view.setUint32(p + 20, Math.floor(duration / 2 ** 32)); // duration hi
  view.setUint32(p + 24, duration >>> 0); // duration lo
  return buf;
}

describe("parseMvhdDuration", () => {
  it("reads a version 0 mvhd", () => {
    expect(parseMvhdDuration(mvhdV0(600, 3600))).toBeCloseTo(6, 5); // 3600/600 = 6s
    expect(parseMvhdDuration(mvhdV0(1000, 6500))).toBeCloseTo(6.5, 5);
  });

  it("reads a version 1 mvhd (64-bit duration)", () => {
    expect(parseMvhdDuration(mvhdV1(90000, 630000))).toBeCloseTo(7, 5);
  });

  it("finds mvhd regardless of where it sits in the slice", () => {
    expect(parseMvhdDuration(mvhdV0(600, 3600, 0))).toBeCloseTo(6, 5);
    expect(parseMvhdDuration(mvhdV0(600, 3600, 4096))).toBeCloseTo(6, 5);
  });

  it("returns null rather than guessing when the box is absent or truncated", () => {
    expect(parseMvhdDuration(new Uint8Array(1024))).toBeNull();
    expect(parseMvhdDuration(mvhdV0(600, 3600).slice(0, 34))).toBeNull();
    expect(parseMvhdDuration(mvhdV0(0, 3600))).toBeNull(); // zero timescale is not 'infinite'
  });
});

describe("evaluateDurationGate", () => {
  const bounds = REEL_DURATION_GATE;

  it("passes a real 6–7s recovery reel", () => {
    expect(evaluateDurationGate(6, bounds).ok).toBe(true);
    expect(evaluateDurationGate(7, bounds).ok).toBe(true);
    expect(evaluateDurationGate(5.5, bounds).ok).toBe(true);
    expect(evaluateDurationGate(7.5, bounds).ok).toBe(true);
  });

  it("fails the durations the current providers actually return", () => {
    // Veo's default is 8s and Kling/Seedance are hardcoded to 10s — both must be caught, not
    // waved through, or the gate is decorative.
    expect(evaluateDurationGate(8, bounds).ok).toBe(false);
    expect(evaluateDurationGate(10, bounds).ok).toBe(false);
    expect(evaluateDurationGate(5, bounds).ok).toBe(false);
  });

  it("treats an unreadable duration as a failure, not a pass", () => {
    const r = evaluateDurationGate(null, bounds, "mvhd box not found");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/could not read video duration/);
    expect(r.reason).toMatch(/mvhd box not found/);
  });

  it("reports the measured duration so an operator can see what actually came back", () => {
    expect(evaluateDurationGate(8.0123, bounds).durationSec).toBe(8.01);
  });
});

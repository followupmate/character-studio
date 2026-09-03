// RECOVERY phase 4 — read an MP4's real duration without ffmpeg.
//
// The QA gate has to know how long the generated video ACTUALLY is, not how long we asked for.
// Shelling out to ffmpeg is not available on Vercel Functions, and pulling the whole file just to
// read one header is wasteful when reels are several MB. MP4 duration lives in the `mvhd` box
// inside `moov`, so this fetches the head of the file, and — for encoders that put `moov` at the
// end instead of the front (no faststart) — the tail as well.
//
// Pure parsing is exported separately from the fetching so it can be unit-tested against a
// synthesised header with no network.

const HEAD_BYTES = 512 * 1024;
const TAIL_BYTES = 512 * 1024;

/**
 * Finds the `mvhd` box in a buffer and returns the duration in seconds, or null when the box is
 * not present in this slice.
 *
 * mvhd layout after the 4-byte type:
 *   version(1) flags(3) then, for version 0: creation(4) modification(4) timescale(4) duration(4)
 *   and for version 1: creation(8) modification(8) timescale(4) duration(8)
 */
export function parseMvhdDuration(buf: Uint8Array): number | null {
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] !== 0x6d || buf[i + 1] !== 0x76 || buf[i + 2] !== 0x68 || buf[i + 3] !== 0x64) continue; // "mvhd"
    const p = i + 4;
    if (p + 4 > buf.length) return null;
    const version = buf[p];
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    try {
      if (version === 0) {
        const off = p + 4 + 8; // flags(3) is part of the 4, then creation+modification
        if (off + 8 > buf.length) return null;
        const timescale = view.getUint32(off);
        const duration = view.getUint32(off + 4);
        if (!timescale) return null;
        return duration / timescale;
      }
      if (version === 1) {
        const off = p + 4 + 16;
        if (off + 12 > buf.length) return null;
        const timescale = view.getUint32(off);
        // Read the 64-bit duration as two uint32s rather than via getBigUint64 — the project
        // targets ES2017 and a real video duration is nowhere near Number's safe-integer limit.
        const durationHi = view.getUint32(off + 4);
        const durationLo = view.getUint32(off + 8);
        const duration = durationHi * 2 ** 32 + durationLo;
        if (!timescale) return null;
        return duration / timescale;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchRange(url: string, range: string): Promise<Uint8Array | null> {
  const res = await fetch(url, { headers: { Range: range } });
  if (!res.ok && res.status !== 206) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export interface VideoProbe {
  durationSec: number | null;
  error?: string;
}

/** Returns the video's duration in seconds, or null with a reason when it cannot be determined. */
export async function probeVideoDuration(url: string): Promise<VideoProbe> {
  try {
    const head = await fetchRange(url, `bytes=0-${HEAD_BYTES - 1}`);
    if (head) {
      const d = parseMvhdDuration(head);
      if (d !== null) return { durationSec: d };
    }

    // moov at the end (encoder did not run faststart) — read the tail.
    const headRes = await fetch(url, { method: "HEAD" });
    const total = Number(headRes.headers.get("content-length") ?? 0);
    if (total > 0) {
      const start = Math.max(0, total - TAIL_BYTES);
      const tail = await fetchRange(url, `bytes=${start}-${total - 1}`);
      if (tail) {
        const d = parseMvhdDuration(tail);
        if (d !== null) return { durationSec: d };
      }
    }

    return { durationSec: null, error: "mvhd box not found in the first or last 512KB" };
  } catch (err) {
    return { durationSec: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DurationGateResult {
  ok: boolean;
  durationSec: number | null;
  reason?: string;
}

/**
 * The gate itself. A duration we could not read is NOT a pass — the whole point is that nothing
 * reaches `ready` unverified — but it is reported distinctly from a real out-of-band duration so
 * an operator can tell a provider quirk from a bad video.
 */
export function evaluateDurationGate(
  durationSec: number | null,
  bounds: { minSec: number; maxSec: number },
  probeError?: string
): DurationGateResult {
  if (durationSec === null) {
    return { ok: false, durationSec: null, reason: `could not read video duration${probeError ? ` (${probeError})` : ""}` };
  }
  const rounded = Math.round(durationSec * 100) / 100;
  if (rounded < bounds.minSec || rounded > bounds.maxSec) {
    return { ok: false, durationSec: rounded, reason: `video is ${rounded}s, outside the ${bounds.minSec}–${bounds.maxSec}s gate` };
  }
  return { ok: true, durationSec: rounded };
}

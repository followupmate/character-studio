"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// RECOVERY phase 4 — the manual half of the first-frame QA gate.
//
// Watch time is decided in the first two seconds, and nobody was ever looking at those two seconds
// before approving. This pulls frame 0, the frame at ~1.5s and the LAST frame out of the generated
// reel and puts them side by side next to the queue item, with the checks that separate the reels
// that held attention from the ones that did not. All must be ticked before "Schváliť" unlocks.
//
// Frames are grabbed in the browser from the <video> element itself — no ffmpeg, no server round
// trip, no extra storage. The automatic half of the gate (real duration inside the band) already
// ran server-side in app/api/characters/generate-media/route.ts, before the row ever reached
// "ready"; this component reports the measured duration so the operator can see it rather than
// take it on trust.

export const QA_CHECKS = [
  { id: "face_visible", label: "Tvár / pohyb viditeľný v prvom frame" },
  { id: "eye_contact", label: "Eye contact do 1,5 s" },
  { id: "no_establishing", label: "Žiadny pomalý establishing shot" },
  {
    id: "loop_closure",
    label: "Loop closure",
    // Added 2026-09-04 after Reel #1 v1 rendered the beat correctly but ended on a smile with eye
    // contact while it had opened on a look away — a visible jump on repeat. The end-frame lock
    // fixes the mechanism; this check is what confirms it actually reads as a loop.
    detail: "posledný frame sa zhoduje so štartom · návrat do pózy je prirodzený · žiadny reverse / snap / forced reset",
  },
] as const;

export type QaCheckId = (typeof QA_CHECKS)[number]["id"];

const FRAME_LABELS = ["0,0 s", "1,5 s", "posledný"];

interface GrabbedFrames {
  frames: string[];
  durationSec: number;
  /**
   * Mean per-pixel difference between frame 0 and the last frame, 0–100. Informational only: it
   * answers "does the last frame look like the first", which is one of the three loop_closure
   * criteria. The other two — whether the return is natural and whether the ending reads as reverse
   * motion — are not measurable this way, so the human checkbox stays authoritative.
   */
  loopDelta: number | null;
}

function meanAbsDiff(a: ImageData, b: ImageData): number {
  let total = 0;
  // Alpha is skipped — it is constant for video frames and would dilute the average.
  for (let i = 0; i < a.data.length; i += 4) {
    total += Math.abs(a.data[i] - b.data[i]);
    total += Math.abs(a.data[i + 1] - b.data[i + 1]);
    total += Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  const samples = (a.data.length / 4) * 3;
  return (total / samples / 255) * 100;
}

async function grabFrames(url: string): Promise<GrabbedFrames> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("video could not be loaded"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");

  // A small second canvas for the loop comparison — a downscaled diff is what we want anyway,
  // since a per-pixel compare at full resolution would score noise and grain rather than pose.
  const small = document.createElement("canvas");
  small.width = 36;
  small.height = 64;
  const smallCtx = small.getContext("2d", { willReadFrequently: true });

  const lastFrameTime = Math.max(0, video.duration - 0.08);
  const times = [0, 1.5, lastFrameTime];

  const frames: string[] = [];
  const thumbs: ImageData[] = [];
  for (const t of times) {
    // A 1.5s seek on a shorter-than-expected clip should still give its last frame rather than
    // failing outright — seeing a too-short reel is exactly what the gate is for.
    const target = Math.min(t, lastFrameTime);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek failed"));
      video.currentTime = target;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.8));
    if (smallCtx) {
      smallCtx.drawImage(video, 0, 0, small.width, small.height);
      thumbs.push(smallCtx.getImageData(0, 0, small.width, small.height));
    }
  }

  let loopDelta: number | null = null;
  if (thumbs.length === 3) {
    try {
      loopDelta = Math.round(meanAbsDiff(thumbs[0], thumbs[2]) * 10) / 10;
    } catch {
      loopDelta = null; // tainted canvas or similar — the human check still stands
    }
  }

  return { frames, durationSec: video.duration, loopDelta };
}

export function FirstFrameQaGate({
  videoUrl,
  checked,
  onToggle,
}: {
  videoUrl: string;
  checked: Set<QaCheckId>;
  onToggle: (id: QaCheckId) => void;
}) {
  const [frames, setFrames] = useState<string[] | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [loopDelta, setLoopDelta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (requested.current === videoUrl) return;
    requested.current = videoUrl;
    setError(null);
    try {
      const out = await grabFrames(videoUrl);
      setFrames(out.frames);
      setDurationSec(out.durationSec);
      setLoopDelta(out.loopDelta);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [videoUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const durationOk = durationSec !== null && durationSec >= 6.5 && durationSec <= 8.5;

  return (
    <div className="border border-border bg-bg3 px-4 py-3">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          First-frame QA — prvé 2 sekundy + loop
        </span>
        <div className="flex items-center gap-1.5">
          {loopDelta !== null && (
            <span
              className="font-mono text-[8px] tracking-[0.08em] px-1.5 py-0.5 border bg-surface-high text-muted border-border"
              title="Priemerný rozdiel prvého a posledného framu (0 = zhodné). Informatívne — rozhoduje tvoje oko."
            >
              loop Δ {loopDelta}
            </span>
          )}
          {durationSec !== null && (
            <span
              className={`font-mono text-[8px] tracking-[0.08em] px-1.5 py-0.5 border ${
                durationOk ? "bg-teal/10 text-teal border-teal/20" : "bg-amber/10 text-amber border-amber/20"
              }`}
            >
              {durationSec.toFixed(2)}s {durationOk ? "OK" : "MIMO 6,5–8,5 s"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[0, 1, 2].map((i) => (
          <figure key={i} className="min-w-0">
            <div
              className={`aspect-[9/16] bg-bg border overflow-hidden flex items-center justify-center ${
                i === 2 ? "border-accent/30" : "border-border"
              }`}
            >
              {frames?.[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frames[i]} alt={FRAME_LABELS[i]} className="w-full h-full object-cover" />
              ) : error ? (
                <span className="material-symbols-outlined text-[20px] text-amber/60">broken_image</span>
              ) : (
                <span className="font-mono text-[8px] text-muted2">…</span>
              )}
            </div>
            <figcaption className="font-mono text-[8px] text-muted2 uppercase mt-1">{FRAME_LABELS[i]}</figcaption>
          </figure>
        ))}
      </div>

      {error && (
        <p className="font-mono text-[8px] text-amber mb-2">
          Frames sa nepodarilo načítať ({error}) — checklist odškrtni až po pozretí videa.
        </p>
      )}

      <ul className="space-y-1.5">
        {QA_CHECKS.map((check) => (
          <li key={check.id}>
            <label className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked.has(check.id)}
                onChange={() => onToggle(check.id)}
                className="accent-accent w-3 h-3 mt-0.5 flex-shrink-0"
              />
              <span className="min-w-0">
                <span
                  className={`font-mono text-[9px] ${
                    checked.has(check.id) ? "text-ink" : "text-muted group-hover:text-ink"
                  } transition-colors`}
                >
                  {check.label}
                </span>
                {"detail" in check && check.detail && (
                  <span className="block font-mono text-[8px] text-muted2 leading-snug">{check.detail}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

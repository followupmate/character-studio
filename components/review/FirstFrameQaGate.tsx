"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// RECOVERY phase 4 — the manual half of the first-frame QA gate.
//
// Watch time is decided in the first two seconds, and nobody was ever looking at those two seconds
// before approving. This pulls frame 0 and the frame at ~1.5s out of the generated reel and puts
// them side by side next to the queue item, with the three checks that separate the reels that
// held attention from the ones that did not. All three must be ticked before "Schváliť" unlocks.
//
// Frames are grabbed in the browser from the <video> element itself — no ffmpeg, no server round
// trip, no extra storage. The automatic half of the gate (real duration inside 5.5–7.5s) already
// ran server-side in app/api/characters/generate-media/route.ts and is enforced there, before the
// row ever reaches "ready"; this component reports the measured duration so the operator can see
// it rather than take it on trust.

export const QA_CHECKS = [
  { id: "face_visible", label: "Tvár / pohyb viditeľný v prvom frame" },
  { id: "eye_contact", label: "Eye contact do 1,5 s" },
  { id: "no_establishing", label: "Žiadny pomalý establishing shot" },
] as const;

export type QaCheckId = (typeof QA_CHECKS)[number]["id"];

const FRAME_TIMES = [0, 1.5];

async function grabFrames(url: string): Promise<{ frames: string[]; durationSec: number }> {
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
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const frames: string[] = [];
  for (const t of FRAME_TIMES) {
    // A 1.5s seek on a shorter-than-expected clip should still give us its last frame rather than
    // failing outright — seeing a too-short reel is exactly what the gate is for.
    const target = Math.min(t, Math.max(0, video.duration - 0.05));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("seek failed"));
      video.currentTime = target;
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas.toDataURL("image/jpeg", 0.8));
  }

  return { frames, durationSec: video.duration };
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [videoUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const durationOk = durationSec !== null && durationSec >= 5.5 && durationSec <= 7.5;

  return (
    <div className="border border-border bg-bg3 px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          First-frame QA — prvé 2 sekundy
        </span>
        {durationSec !== null && (
          <span
            className={`font-mono text-[8px] tracking-[0.08em] px-1.5 py-0.5 border ${
              durationOk ? "bg-teal/10 text-teal border-teal/20" : "bg-amber/10 text-amber border-amber/20"
            }`}
          >
            {durationSec.toFixed(2)}s {durationOk ? "OK" : "MIMO 5,5–7,5 s"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {[0, 1].map((i) => (
          <figure key={i} className="min-w-0">
            <div className="aspect-[9/16] bg-bg border border-border overflow-hidden flex items-center justify-center">
              {frames?.[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frames[i]} alt={i === 0 ? "Prvý frame" : "Frame v 1,5 s"} className="w-full h-full object-cover" />
              ) : error ? (
                <span className="material-symbols-outlined text-[20px] text-amber/60">broken_image</span>
              ) : (
                <span className="font-mono text-[8px] text-muted2">…</span>
              )}
            </div>
            <figcaption className="font-mono text-[8px] text-muted2 uppercase mt-1">
              {i === 0 ? "0,0 s" : "1,5 s"}
            </figcaption>
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
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked.has(check.id)}
                onChange={() => onToggle(check.id)}
                className="accent-accent w-3 h-3"
              />
              <span
                className={`font-mono text-[9px] ${
                  checked.has(check.id) ? "text-ink" : "text-muted group-hover:text-ink"
                } transition-colors`}
              >
                {check.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

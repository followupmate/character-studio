import type { PromptDirectorInput, VideoIntent } from "./types";
import { cleanList, isCloseUpArchetype } from "./helpers";

// Deterministic VIDEO section builders (spec §8–19). `intent` is always the ALREADY-RESOLVED
// VideoIntent (abstract mood words translated to observable behavior by
// lib/promptDirector/performanceTransformer.ts, auto-speech text already generated) — these
// builders never call an LLM themselves.

// §8A — START FRAME / REFERENCE. Video must not re-describe frame 0, only what changes after it.
export function buildStartFrameReferenceSection(input: PromptDirectorInput): string[] {
  if (input.generationMode !== "image_to_video" || !input.hasReferenceImage) return [];
  return cleanList([
    "Use the supplied image as the exact starting frame.",
    "Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame.",
    "Describe only what changes after frame 0 — do not re-describe the starting frame itself.",
  ]);
}

// §9 — IDENTITY & TEMPORAL STABILITY (always present for video)
export function buildIdentityStabilitySection(input: PromptDirectorInput): string[] {
  const lines = [
    "Preserve exact facial identity throughout the entire shot.",
    "Stable facial structure, same hairstyle, same body proportions.",
    "No face morphing, no identity drift.",
  ];
  if (isCloseUpArchetype(input)) {
    lines.push("Preserve skin texture and pores, no smoothing, no beauty enhancement.", "Stable lips and teeth.");
  }
  return cleanList(lines);
}

// §10 — VIDEO SPECS, using only what the target provider can actually control (spec: "Nevkladaj
// fake specs, ktoré provider nevie ovládať" — capability gating happens in modelProfiles.ts, this
// builder just states the intent-level facts).
export function buildVideoSpecsSection(intent: VideoIntent | undefined): string[] {
  const lines: string[] = ["Single continuous shot."];
  if (intent?.durationSec) lines.push(`Duration: ${intent.durationSec}s`);
  lines.push("Vertical 9:16.");
  return cleanList(lines);
}

// §11 — CAMERA BEHAVIOR. Must be one explicit, non-contradictory choice — cross-source conflict
// resolution (e.g. archetype framing says one thing, videoIntent.cameraBehavior another) runs in
// lib/promptDirector/validator.ts's resolveCameraConflicts(); this builder just states the
// candidates in priority order (explicit user/videoIntent choice first).
export function buildCameraBehaviorSection(input: PromptDirectorInput, intent: VideoIntent | undefined): string[] {
  const lines: string[] = [];
  if (intent?.cameraBehavior) lines.push(intent.cameraBehavior);
  else lines.push("static camera");
  lines.push(`Framing: ${input.slot.framing}`);
  return cleanList(lines);
}

// §12 — HUMAN MICRO-MOVEMENT (default layer for realistic video; heavier on close-up).
export function buildHumanMovementSection(input: PromptDirectorInput): string[] {
  const base = ["natural blinking", "subtle breathing", "minor posture shifts"];
  if (isCloseUpArchetype(input)) {
    return cleanList([...base, "micro facial expressions", "slight asymmetric mouth movement", "natural eye movement"]);
  }
  return cleanList([...base, "small head adjustments"]);
}

// §13 — BODY MOTION. Physical, not abstract — the caller must have already translated any
// abstract mood word (e.g. "confident") into a concrete action via performanceTransformer before
// this builder runs; this just formats it plus the walking-specific physics addenda when relevant.
export function buildBodyMotionSection(intent: VideoIntent | undefined): string[] {
  if (!intent?.action) return [];
  const lines = [intent.action];
  if (/walk/i.test(intent.action)) {
    lines.push("Natural walking rhythm, realistic arm swing, small vertical body movement, natural clothing response.");
  }
  return cleanList(lines);
}

// §14 — PHYSICS LAYER. Only emitted when the action text implies a real physical interaction —
// never inserted generically (spec: "Nevkladaj physics instructions, keď sa nič fyzicky komplexné
// nedeje").
const PHYSICS_HINTS: Array<{ pattern: RegExp; lines: string[] }> = [
  {
    pattern: /drink|sip|glass|cup/i,
    lines: ["Rim touches lips, glass tilts naturally, liquid follows gravity, liquid level changes, natural swallow."],
  },
  {
    pattern: /walk|step|stride/i,
    lines: ["Feet contact ground realistically, weight transfers naturally, fabric responds to movement."],
  },
];

export function buildPhysicsSection(intent: VideoIntent | undefined): string[] {
  if (!intent?.action) return [];
  const lines: string[] = [];
  for (const hint of PHYSICS_HINTS) {
    if (hint.pattern.test(intent.action)) lines.push(...hint.lines);
  }
  return cleanList(lines);
}

// §15 — TIMELINE. Only used when the video has more than one significant beat.
export function buildTimelineSection(intent: VideoIntent | undefined): string[] {
  if (!intent?.timeline || intent.timeline.length < 2) return [];
  return intent.timeline.map((beat) => `${beat.startSec.toFixed(1)}–${beat.endSec.toFixed(1)}s: ${beat.action}`);
}

// §16 — SPEECH MODES. `resolvedText` is the already-final line (manual verbatim, or auto-generated
// by performanceTransformer) — this builder never edits it, only formats the instruction envelope.
export function buildSpeechSection(intent: VideoIntent | undefined, resolvedText?: string): string[] {
  const speech = intent?.speech;
  if (!speech || speech.source === "none") return [];
  const lines: string[] = [];
  if (resolvedText) {
    lines.push(`EXACT SPOKEN LINE — DO NOT CHANGE WORDING:\n"${resolvedText}"`);
  }
  if (speech.language) lines.push(`Language: ${speech.language}`);
  if (speech.tone) lines.push(`Tone: ${speech.tone}`);
  if (speech.pace) lines.push(`Pace: ${speech.pace}`);
  if (speech.voiceProfile) lines.push(`Voice profile: ${speech.voiceProfile}`);
  return cleanList(lines);
}

// §17 — TALKING VIDEO face behavior
export function buildTalkingFaceBehaviorSection(): string[] {
  return [
    "natural blinking",
    "small eye movement",
    "subtle cheek movement",
    "minimal natural jaw motion",
    "slightly asymmetric lip articulation",
    "subtle breathing",
  ];
}

// §17 — LIPSYNC priority block. Always states the priority explicitly so a downstream provider
// (or human reviewer) can see facial integrity was never traded away for phoneme accuracy.
export function buildLipSyncSection(): string[] {
  return [
    "Priority: realistic facial integrity > natural articulation > perfect phoneme sync.",
    "No oversized mouth opening, no lip inflation, no teeth distortion, no face morphing, no exaggerated vowel shapes.",
  ];
}

// §18 — AUDIO. Caller (compiler) is responsible for only invoking this when the target model's
// capability table says supportsAudio — this builder itself is capability-agnostic.
const AMBIENCE_HINTS: Record<string, string> = {
  bathroom: "bathroom reverb",
  kitchen: "natural room tone",
  car: "car cabin ambience",
  mall: "mall reverb",
  street: "outdoor ambience",
  beach: "outdoor ambience",
  outdoor: "outdoor ambience",
};

export function buildAudioSection(input: PromptDirectorInput): string[] {
  const lines = ["smartphone microphone"];
  const spatialLower = input.sceneBrief.spatial_setup.toLowerCase();
  const match = Object.entries(AMBIENCE_HINTS).find(([key]) => spatialLower.includes(key));
  lines.push(match ? match[1] : "natural room tone");
  lines.push("no artificial studio polish");
  return cleanList(lines);
}

// §9/§26 — VIDEO STABILITY, positive-phrased instruction form (the same facts also feed the
// negatives section via lib/promptDirector/negativeBuilder.ts, phrased as "no X" there).
export function buildStabilitySection(): string[] {
  return [
    "No face morphing, no body morphing.",
    "No environment jump, no random camera reframing.",
  ];
}

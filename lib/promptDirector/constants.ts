import type { PromptDirectorTargetModel } from "./types";

// Global priority hierarchy (spec §6). Higher-priority items win when instructions conflict —
// e.g. perfect lipsync must never deform the face. Consumers (validator, model profile
// compilers) order sections by this list rather than re-deciding priority ad hoc.
export const PRIORITY_HIERARCHY = [
  "identity_preservation",
  "facial_anatomical_integrity",
  "scene_reference_continuity",
  "natural_human_physics",
  "user_requested_action_speech",
  "camera_framing",
  "lighting",
  "styling",
  "aesthetic_polish",
] as const;

export type PriorityKey = (typeof PRIORITY_HIERARCHY)[number];

// Talking-video-specific override of the general hierarchy (spec §6/§17): facial integrity beats
// natural mouth movement, which beats perfect phoneme sync.
export const TALKING_VIDEO_PRIORITY = [
  "facial_integrity",
  "natural_mouth_movement",
  "phoneme_perfection",
] as const;

export interface ModelCapability {
  id: PromptDirectorTargetModel;
  label: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsImageToVideo: boolean;
  supportsTextToVideo: boolean;
  // "Native" audio/speech/lipsync in the model call itself — NOT a bolt-on second call.
  supportsAudio: boolean;
  supportsSpeech: boolean;
  supportsLipSync: boolean;
  // Whether an actual provider call for this target exists in this repo today (see
  // app/api/characters/generate-media/route.ts and lib/klingProvider.ts). Prompt Director
  // compiles a well-formed prompt for every target regardless — this flag is provenance-only,
  // so downstream code never silently treats an unwired model as production-ready.
  liveIntegration: boolean;
  focus: string[];
}

// Verified against the current repo (see app/api/characters/generate-media/route.ts,
// lib/klingProvider.ts, lib/higgsfieldSoul.ts, lib/seedancePromptCompiler.ts) rather than
// assumed from the spec text — per the instruction not to invent audio/speech support where the
// integration doesn't actually have it.
export const MODEL_CAPABILITIES: Record<PromptDirectorTargetModel, ModelCapability> = {
  soul2: {
    id: "soul2",
    label: "Higgsfield Soul V2 (image) — lib/higgsfieldSoul.ts",
    supportsImage: true,
    supportsVideo: false,
    supportsImageToVideo: false,
    supportsTextToVideo: false,
    supportsAudio: false,
    supportsSpeech: false,
    supportsLipSync: false,
    liveIntegration: true,
    focus: ["identity", "scene", "camera", "light", "texture", "anatomy", "negatives"],
  },
  kling: {
    id: "kling",
    label: "Kling (video, fal.ai) — lib/klingProvider.ts",
    supportsImage: false,
    supportsVideo: true,
    supportsImageToVideo: true,
    supportsTextToVideo: true,
    // Kling has no native audio in the video model itself. The repo bolts audio on afterward via
    // a separate fal-ai/mmaudio-v2 call outside prompt compilation (generate-media/route.ts) — that
    // is not something a text prompt can express, so Prompt Director treats Kling as silent.
    supportsAudio: false,
    supportsSpeech: false,
    supportsLipSync: false,
    liveIntegration: true,
    focus: ["start frame", "subject motion", "camera motion", "temporal identity", "realistic body physics", "concise negative/stability rules"],
  },
  higgsfield: {
    id: "higgsfield",
    label: "Higgsfield video/performance — NOT wired to a live provider call in this repo",
    supportsImage: false,
    supportsVideo: true,
    supportsImageToVideo: true,
    supportsTextToVideo: false,
    supportsAudio: false,
    supportsSpeech: false,
    supportsLipSync: false,
    liveIntegration: false,
    focus: ["pose/performance", "camera action", "face behavior", "scene realism", "identity consistency"],
  },
  seedance: {
    id: "seedance",
    label: "Seedance 2.0 (video, fal.ai/ByteDance) — lib/seedancePromptCompiler.ts",
    supportsImage: false,
    supportsVideo: true,
    supportsImageToVideo: true,
    supportsTextToVideo: false,
    // generate_audio boolean + AUDIO_HINTS prompt text (incl. a "dialogue" hint) exist today in
    // generate-media/route.ts. No confirmed lipsync-grade talking-head capability, so
    // supportsLipSync stays false until that's verified against a real generation.
    supportsAudio: true,
    supportsSpeech: true,
    supportsLipSync: false,
    liveIntegration: true,
    focus: ["shot direction", "timeline", "body action", "camera action", "environment evolution", "hook"],
  },
  wan: {
    id: "wan",
    label: "Wan — not present anywhere in this repo, net-new provider",
    supportsImage: false,
    supportsVideo: true,
    supportsImageToVideo: true,
    supportsTextToVideo: false,
    supportsAudio: false,
    supportsSpeech: false,
    supportsLipSync: false,
    liveIntegration: false,
    focus: ["image-to-video continuation", "one clear action", "stable identity", "restrained camera/movement", "avoid verbose redundant scene description"],
  },
};

// Default realism posture for Character Studio content (spec §19) — NOT automatically
// "cinematic". A distinct cinematic profile may exist per-slot/doctrine (see lib/slotPrompts.ts's
// "cinematic" doctrine) but social_realism is Prompt Director's default for social content.
export const SOCIAL_REALISM_PROFILE = {
  id: "social_realism",
  lines: [
    "smartphone / casual camera language",
    "natural lighting",
    "real exposure behavior",
    "subtle camera imperfections",
    "non-perfect human performance",
    "natural skin texture",
    "no cinematic grading",
    "no beauty filter",
  ],
};

// Camera-behavior conflict groups (spec §11) — at most one phrase from a group may survive in the
// compiled camera section. Order = priority when multiple survive a naive union (explicit
// archetype/videoIntent.cameraBehavior choices are resolved before this table is consulted; this
// table only catches accidental duplicate/contradictory phrasing assembled from separate sources).
export const CAMERA_CONFLICT_GROUPS: string[][] = [
  ["static camera", "handheld", "natural handheld smartphone", "slow tracking movement", "slow pan", "slow dolly in", "slow dolly out", "orbit"],
];

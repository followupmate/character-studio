import type { SceneBriefJson } from "@/lib/sceneBrief";
import type { SlotSpec } from "@/lib/archetypeDeck";

// Prompt Director v1 — shared types. See docs discussion / spec in the PR description for the
// full design; this file is the single source of truth for the shapes referenced across
// lib/promptDirector/*.

export type PromptDirectorOutputType = "image" | "video" | "talking_video";

export type PromptDirectorGenerationMode = "text_to_image" | "image_to_video" | "text_to_video";

// NOTE: "soul2" and "higgsfield" are deliberately separate targets even though both ultimately
// call the Higgsfield platform in principle — "soul2" is the already-live Soul V2 IMAGE model
// (lib/higgsfieldSoul.ts), "higgsfield" here means a Higgsfield VIDEO/performance product per the
// spec's model-profile section. That video path has no live provider call in this repo today (see
// lib/promptDirector/constants.ts MODEL_CAPABILITIES.higgsfield.liveIntegration) — the compiler
// still produces a well-formed prompt for it, but nothing calls a real API with it yet.
export type PromptDirectorTargetModel = "soul2" | "kling" | "higgsfield" | "seedance" | "wan";

export type VideoIntentMode = "motion_only" | "voice_over" | "talking_to_camera";

export interface VideoIntentTimelineBeat {
  startSec: number;
  endSec: number;
  action: string;
}

export type SpeechSource = "none" | "auto" | "manual";

export interface VideoIntentSpeech {
  source: SpeechSource;
  text?: string;
  language?: string;
  tone?: string;
  pace?: string;
  voiceProfile?: string;
}

export interface VideoIntent {
  mode: VideoIntentMode;
  durationSec?: number;
  action?: string;
  emotionalDelivery?: string;
  cameraBehavior?: string;
  timeline?: VideoIntentTimelineBeat[];
  speech?: VideoIntentSpeech;
}

export interface PromptDirectorCharacter {
  id: string;
  name: string;
  visualBrief: string;
  sacredDetails: Record<string, unknown> | null;
  soulId?: string | null;
}

export interface PromptDirectorInput {
  character: PromptDirectorCharacter;
  sceneBrief: SceneBriefJson;
  slot: SlotSpec;
  archetypeId: string;
  archetypeGuidance: string;
  outputType: PromptDirectorOutputType;
  generationMode: PromptDirectorGenerationMode;
  targetModel: PromptDirectorTargetModel;
  situationTranslation?: string;
  videoIntent?: VideoIntent;
  // First-frame preparation (spec §21) — when this image slot will later be used as an i2v
  // start frame, the planned video intent must shape the frame (space to walk into, mouth
  // unobstructed for talking, anatomically stable gesture start).
  plannedVideoIntent?: VideoIntent;
  // Whether a real identity/start-frame image is actually being handed to the provider for this
  // generation (vs. text-only). Drives whether the "use provided image as identity reference"
  // language is emitted at all — see §7A / §8A.
  hasReferenceImage?: boolean;
  // F1 — luxury world doctrine enabled for this generation
  luxuryWorldEnabled?: boolean;
}

export interface PromptPackageSections {
  priority?: string[];
  reference?: string[];
  identity?: string[];
  videoSpecs?: string[];
  scene?: string[];
  camera?: string[];
  pose?: string[];
  lighting?: string[];
  aesthetic?: string[];
  appearance?: string[];
  realism?: string[];
  imperfections?: string[];
  expression?: string[];
  humanMovement?: string[];
  environmentMovement?: string[];
  timeline?: string[];
  speech?: string[];
  lipSync?: string[];
  audio?: string[];
  stability?: string[];
  negatives?: string[];
}

export type PromptPackageSectionKey = keyof PromptPackageSections;

export interface PromptPackageValidation {
  errors: string[];
  warnings: string[];
}

export interface PromptPackage {
  model: string;
  positivePrompt: string;
  negativePrompt?: string;
  sections: PromptPackageSections;
  metadata: {
    promptDirectorVersion: "v1";
    modelProfile: string;
    outputType: PromptDirectorOutputType;
    generationMode: PromptDirectorGenerationMode;
    validation?: PromptPackageValidation;
  };
}

// Re-exported so callers of lib/promptDirector don't also need to reach into lib/sceneBrief /
// lib/archetypeDeck just to type a PromptDirectorInput.
export type { SceneBriefJson, SlotSpec };

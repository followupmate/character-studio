import type { PromptDirectorInput, PromptPackage, PromptPackageSections, VideoIntent } from "./types";
import { PRIORITY_HIERARCHY, TALKING_VIDEO_PRIORITY } from "./constants";
import {
  buildAestheticSection,
  buildAppearanceSection,
  buildCameraSection,
  buildIdentitySection,
  buildImperfectionsSection,
  buildLightingSection,
  buildPoseActionSection,
  buildReferenceSection,
  buildRealismSection,
  buildSceneSection,
} from "./imageSections";
import {
  buildAudioSection,
  buildBodyMotionSection,
  buildCameraBehaviorSection,
  buildIdentityStabilitySection,
  buildHumanMovementSection,
  buildLipSyncSection,
  buildPhysicsSection,
  buildSpeechSection,
  buildStabilitySection,
  buildStartFrameReferenceSection,
  buildTalkingFaceBehaviorSection,
  buildTimelineSection,
  buildVideoSpecsSection,
} from "./videoSections";
import { buildNegatives } from "./negativeBuilder";
import { resolveSpeechText, resolveVideoIntentPerformance } from "./performanceTransformer";
import { resolveCameraConflicts, validatePromptDirectorInput } from "./validator";
import { compileNegativePrompt, compilePositivePrompt } from "./modelProfiles";
import { MODEL_CAPABILITIES } from "./constants";
import { cleanList } from "./helpers";

// Prompt Director v1 — main entry point. Takes the existing creative intent (SceneBrief + slot +
// archetype, already decided upstream by story generation / styling / archetype selection) and
// compiles it into a provider-specific PromptPackage. Never invents scene/wardrobe/character facts
// — every deterministic section reads only from sceneBrief / character.sacredDetails / slot /
// videoIntent, per the "no invention" rule (spec §22).

function buildPriorityLines(outputType: PromptDirectorInput["outputType"]): string[] {
  if (outputType === "talking_video") return [...TALKING_VIDEO_PRIORITY];
  return [...PRIORITY_HIERARCHY];
}

async function buildImageSections(input: PromptDirectorInput): Promise<PromptPackageSections> {
  // Soul 2.0 wants identity + pose/action fused into one front-loaded block rather than a
  // separate identity paragraph restating what the Soul ID reference already carries — same
  // "combine two builder outputs, keep both individually addressable" pattern buildVideoSections
  // uses for humanMovement below.
  const identity = buildIdentitySection(input);
  const pose = cleanList([...identity, ...buildPoseActionSection(input)]);

  return {
    priority: buildPriorityLines(input.outputType),
    reference: buildReferenceSection(input),
    identity,
    pose,
    scene: buildSceneSection(input),
    appearance: buildAppearanceSection(input),
    camera: buildCameraSection(input),
    lighting: buildLightingSection(input),
    aesthetic: buildAestheticSection(input),
    realism: buildRealismSection(input),
    imperfections: buildImperfectionsSection(input),
    negatives: buildNegatives(input),
  };
}

async function buildVideoSections(input: PromptDirectorInput, capability: (typeof MODEL_CAPABILITIES)[keyof typeof MODEL_CAPABILITIES]): Promise<{ sections: PromptPackageSections; resolvedIntent: VideoIntent | undefined }> {
  const rawIntent = input.videoIntent;
  const resolvedIntent = rawIntent ? resolveVideoIntentPerformance(rawIntent) : undefined;

  const speechText = capability.supportsSpeech ? await resolveSpeechText(input, resolvedIntent) : undefined;

  const cameraCandidates = buildCameraBehaviorSection(input, resolvedIntent);
  const { resolved: cameraResolved } = resolveCameraConflicts(cameraCandidates);

  const humanMovement = cleanList([
    ...buildHumanMovementSection(input),
    ...buildBodyMotionSection(resolvedIntent),
  ]);

  const isTalking = input.outputType === "talking_video";

  const sections: PromptPackageSections = {
    priority: buildPriorityLines(input.outputType),
    reference: buildStartFrameReferenceSection(input),
    identity: buildIdentityStabilitySection(input),
    appearance: buildAppearanceSection(input),
    videoSpecs: buildVideoSpecsSection(resolvedIntent),
    camera: cameraResolved,
    humanMovement,
    environmentMovement: buildPhysicsSection(resolvedIntent),
    timeline: buildTimelineSection(resolvedIntent),
    stability: buildStabilitySection(),
    negatives: buildNegatives(input),
  };

  if (isTalking) {
    sections.expression = buildTalkingFaceBehaviorSection();
    sections.lipSync = buildLipSyncSection();
  }

  if (capability.supportsSpeech && resolvedIntent?.speech && resolvedIntent.speech.source !== "none") {
    sections.speech = buildSpeechSection(resolvedIntent, speechText);
  }

  if (capability.supportsAudio) {
    sections.audio = buildAudioSection(input);
  }

  return { sections, resolvedIntent };
}

export async function compilePromptDirector(input: PromptDirectorInput): Promise<PromptPackage> {
  const capability = MODEL_CAPABILITIES[input.targetModel];

  // Pre-resolve videoIntent performance language before validation so warnings/errors are checked
  // against the GROUNDED intent (e.g. an abstract "confident" action is fine; a truly empty action
  // is not).
  const preResolvedIntent = input.videoIntent ? resolveVideoIntentPerformance(input.videoIntent) : undefined;
  const validation = validatePromptDirectorInput(input, preResolvedIntent);

  if (validation.errors.length > 0) {
    throw new Error(`Prompt Director validation failed: ${validation.errors.join("; ")}`);
  }

  const { sections } =
    input.outputType === "image"
      ? { sections: await buildImageSections(input) }
      : await buildVideoSections(input, capability);

  const positivePrompt = compilePositivePrompt(sections, input.targetModel, input.outputType);
  const negativePrompt = compileNegativePrompt(sections.negatives);

  return {
    model: input.targetModel,
    positivePrompt,
    negativePrompt,
    sections,
    metadata: {
      promptDirectorVersion: "v1",
      modelProfile: capability.label,
      outputType: input.outputType,
      generationMode: input.generationMode,
      validation,
    },
  };
}

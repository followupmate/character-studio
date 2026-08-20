import type { PromptDirectorInput, PromptPackageValidation, VideoIntent } from "./types";
import { CAMERA_CONFLICT_GROUPS } from "./constants";
import { archetypeAllowsProp } from "./helpers";

// Content validator (spec §22) — runs BEFORE compilation. Returns errors (hard-block compilation
// — caller should refuse to produce a PromptPackage) and warnings (surfaced in metadata.validation
// for the debug/audit view, but compilation proceeds).

export function validatePromptDirectorInput(input: PromptDirectorInput, resolvedIntent?: VideoIntent): PromptPackageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // identity defined?
  if (!input.character.visualBrief || !input.character.visualBrief.trim()) {
    errors.push("identity not defined: character.visualBrief is empty");
  }

  // scene anchored?
  if (!input.sceneBrief.spatial_setup || !input.sceneBrief.spatial_setup.trim()) {
    errors.push("scene not anchored: sceneBrief.spatial_setup is empty");
  }

  // props allowed? — a prop-demanding archetype with an empty allowed_props list can't be honored.
  if (archetypeAllowsProp(input.archetypeId) && (input.sceneBrief.allowed_props ?? []).length === 0) {
    warnings.push(`archetype "${input.archetypeId}" expects a prop but sceneBrief.allowed_props is empty`);
  }

  if (input.outputType !== "image") {
    const intent = resolvedIntent ?? input.videoIntent;

    // action concrete? — required PRIMARILY for motion_only: with no action, no timeline and no
    // speech, motion_only has genuinely nothing telling the video what happens. talking_to_camera
    // with an active speech source is exempt — the deterministic talking-performance layer
    // (buildTalkingFaceBehaviorSection: blink/breathing/facial movement) plus the spoken line ARE
    // the concrete action, so flagging "no action" there was a false positive. talking_to_camera
    // WITHOUT speech still has nothing concrete and keeps the warning; voice_over was already exempt
    // (the narration itself is the content).
    if (intent && !intent.action && (!intent.timeline || intent.timeline.length === 0)) {
      const hasTalkingPerformance = intent.mode === "talking_to_camera" && intent.speech && intent.speech.source !== "none";
      const impliedByMode = intent.mode === "voice_over" || hasTalkingPerformance;
      if (!impliedByMode) {
        warnings.push(`no concrete action or timeline provided for a ${intent.mode} video intent`);
      }
    }

    // camera compatible with action? — a "static camera" instruction paired with an action that
    // explicitly requires camera movement (tracking/following/orbit) is a soft contradiction worth
    // flagging even though resolveCameraConflicts() only catches literal phrase collisions.
    if (intent?.action && intent?.cameraBehavior) {
      const actionImpliesMovingCamera = /follow|track|orbit|pan with|dolly with/i.test(intent.action);
      const cameraIsStatic = /static/i.test(intent.cameraBehavior);
      if (actionImpliesMovingCamera && cameraIsStatic) {
        warnings.push("action implies a moving/following camera but cameraBehavior specifies a static camera");
      }
    }

    // speech length compatible with duration?
    if (intent?.speech?.source === "manual" && intent.speech.text && intent.durationSec) {
      const words = intent.speech.text.trim().split(/\s+/).filter(Boolean).length;
      const maxWords = Math.round(intent.durationSec * 2.6); // generous upper bound, natural fast speech
      if (words > maxWords) {
        warnings.push(`manual speech text (${words} words) may not fit in ${intent.durationSec}s at a natural pace`);
      }
    }

    // timeline sanity — beats must be ordered and within duration, and must not overlap.
    if (intent?.timeline && intent.timeline.length > 0) {
      const sorted = [...intent.timeline].sort((a, b) => a.startSec - b.startSec);
      for (let i = 0; i < sorted.length; i++) {
        const beat = sorted[i];
        if (beat.endSec <= beat.startSec) {
          errors.push(`timeline beat "${beat.action}" has endSec <= startSec`);
        }
        if (i > 0 && beat.startSec < sorted[i - 1].endSec) {
          warnings.push(`timeline beats overlap around ${beat.startSec}s`);
        }
      }
      if (intent.durationSec) {
        const last = sorted[sorted.length - 1];
        if (last.endSec > intent.durationSec + 0.5) {
          warnings.push(`timeline extends to ${last.endSec}s but durationSec is ${intent.durationSec}`);
        }
      }
    }

    // talking_to_camera specific: mouth must be describable as unobstructed — a manual/auto speech
    // request on a close-up-excluded / face-cropped archetype is a contradiction (see spec §21).
    if (input.outputType === "talking_video" && intent?.speech && intent.speech.source !== "none") {
      const framingHidesFace = /over[- ]shoulder|from behind|face[- ]away|headless/i.test(input.slot.framing);
      if (framingHidesFace) {
        errors.push("talking_video requested but this slot's framing hides the face — mouth must be visible for speech/lipsync");
      }
    }
  }

  return { errors, warnings };
}

// §11 — resolves camera-behavior conflicts (e.g. "static camera" + "handheld" + "dolly movement"
// assembled from different sources). Keeps the FIRST phrase found per conflict group — callers
// order candidate lines with the highest-priority source (explicit videoIntent.cameraBehavior)
// first, so "first wins" matches the intended priority.
export function resolveCameraConflicts(lines: string[]): { resolved: string[]; removed: string[] } {
  const removed: string[] = [];
  let resolved = [...lines];

  for (const group of CAMERA_CONFLICT_GROUPS) {
    const lowerGroup = group.map((g) => g.toLowerCase());
    const present = resolved.filter((line) => lowerGroup.some((g) => line.toLowerCase().includes(g)));
    if (present.length > 1) {
      const [keep, ...drop] = present;
      resolved = resolved.filter((line) => line === keep || !drop.includes(line));
      removed.push(...drop);
    }
  }

  return { resolved, removed };
}

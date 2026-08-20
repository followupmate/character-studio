import type { PromptDirectorInput } from "./types";
import { archetypeAllowsProp, cleanList } from "./helpers";

// Contextual negative-prompt builder (spec §7G / §27). Deliberately NOT a blind 100-term
// blacklist — base negatives are fixed per output type, contextual ones are added only when the
// scene/slot actually implies the risk. For images (soul2), Higgsfield Soul 2.0 guidance calls
// for a short negative block specifically — see contextualImageNegatives() below.
const BASE_IMAGE_NEGATIVES = ["beauty filter", "plastic skin", "CGI look", "identity drift", "warped anatomy"];

const BASE_VIDEO_NEGATIVES = [
  "face morphing",
  "identity drift",
  "robotic movement",
  "jerky head movement",
  "body warping",
  "environment changes",
  "temporal flicker",
];

const TALKING_VIDEO_NEGATIVES = [
  "lip morphing",
  "teeth distortion",
  "oversized mouth movement",
  "robotic speech",
  "unnatural articulation",
];

// Scene-specific additions only when the scene/slot actually implies the risk — e.g. an
// archetype that doesn't allow a prop is exactly where an invented prop is a real failure mode;
// one that does allow a prop already constrains what can appear, so the line would be noise.
function contextualImageNegatives(input: PromptDirectorInput): string[] {
  const extra: string[] = [];
  if (!archetypeAllowsProp(input.archetypeId)) extra.push("no invented props");
  if (input.sceneBrief.pet_lock) extra.push("no incorrect animal breed or color");
  return extra;
}

export function buildNegatives(input: PromptDirectorInput): string[] {
  if (input.outputType === "image") {
    return cleanList([...BASE_IMAGE_NEGATIVES, ...contextualImageNegatives(input)]);
  }

  const negatives = [...BASE_VIDEO_NEGATIVES];
  if (input.outputType === "talking_video") {
    negatives.push(...TALKING_VIDEO_NEGATIVES);
  }
  return cleanList(negatives);
}

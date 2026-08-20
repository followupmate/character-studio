import type { PromptDirectorInput } from "./types";
import { cleanList } from "./helpers";

// Contextual negative-prompt builder (spec §7G / §27). Deliberately NOT a blind 100-term
// blacklist — base negatives are fixed per output type, contextual ones are added only when the
// scene/slot actually implies the risk (e.g. "no text" only when the scene could plausibly render
// text-bearing objects).

const BASE_IMAGE_NEGATIVES = [
  "beauty filter",
  "plastic skin",
  "skin smoothing",
  "AI face",
  "identity drift",
  "perfect facial symmetry",
  "CGI look",
  "warped anatomy",
  "malformed hands",
  "extra limbs",
  "distorted face",
];

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

export function buildNegatives(input: PromptDirectorInput): string[] {
  if (input.outputType === "image") {
    const negatives = [...BASE_IMAGE_NEGATIVES, "no invented props", "no watermark", "no text"];
    // Social-realism default (spec §19) actively wants smartphone imperfection, so only ban
    // studio/fake-DOF/glam looks when the doctrine hasn't explicitly asked for cinematic polish.
    negatives.push("no studio lighting", "no fake depth of field", "no glam look");
    return cleanList(negatives);
  }

  const negatives = [...BASE_VIDEO_NEGATIVES];
  if (input.outputType === "talking_video") {
    negatives.push(...TALKING_VIDEO_NEGATIVES);
  }
  return cleanList(negatives);
}

import type { PromptDirectorInput } from "./types";
import { archetypeAllowsProp, cleanList } from "./helpers";
import { LUXURY_NEGATIVES } from "@/lib/luxuryWorld"; // F1

// Contextual negative-prompt builder (spec §7G / §27). Deliberately NOT a blind 100-term
// blacklist — base negatives are fixed per output type, contextual ones are added only when the
// scene/slot actually implies the risk. For images (soul2), Higgsfield Soul 2.0 guidance calls
// for a short negative block specifically — see contextualImageNegatives() below.
// F0.5 — added anti-doubling terms (from production incident diagnosis)
const BASE_IMAGE_NEGATIVES = [
  "beauty filter",
  "plastic skin",
  "CGI look",
  "identity drift",
  "warped anatomy",
  "split frame",
  "diptych",
  "collage",
  "two panels",
  "duplicated person",
  "second copy of the same woman",
];

// Text-rendering protection (production incident, day 82) — Higgsfield rendered visible text
// into a reel_start_frame image, most likely primed by "text overlay" language that leaked into
// the positive prompt from slot.framing (see lib/promptDirector/imageSections.ts's
// sanitizeFramingForSoul2()). This is the second layer of defense: even a clean positive prompt
// benefits from an explicit negative, so image generation never defaults to rendering UI/caption
// elements. SceneBriefJson has no field for "this scene explicitly needs visible text" today — if
// one is ever added, gate this on its absence rather than always including it.
const TEXT_RENDERING_NEGATIVES = ["no text", "no captions", "no typography", "no labels", "no UI elements", "no watermark"];

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

// Veo's native audio/dialogue generation can render on-screen captions/subtitles alongside
// spoken lines unless told not to — no equivalent risk on Kling/Seedance since neither renders
// text from a dialogue instruction (Kling has no native audio; Seedance's dialogue is a
// generate_audio flag, not a caption-prone feature).
const VEO_TEXT_NEGATIVES = ["no subtitles", "no captions", "no on-screen text", "no karaoke-style lyrics"];

// Scene-specific additions only when the scene/slot actually implies the risk — e.g. an
// archetype that doesn't allow a prop is exactly where an invented prop is a real failure mode;
// one that does allow a prop already constrains what can appear, so the line would be noise.
function contextualImageNegatives(input: PromptDirectorInput): string[] {
  const extra: string[] = [];
  if (!archetypeAllowsProp(input.archetypeId)) extra.push("no invented props");
  if (input.sceneBrief.pet_lock) extra.push("no incorrect animal breed or color");
  return extra;
}

export function buildNegatives(input: PromptDirectorInput, luxuryWorldEnabled?: boolean): string[] {
  if (input.outputType === "image") {
    // F1 — add luxury negatives when luxury_world_v1 is enabled
    const luxNegatives = luxuryWorldEnabled ? LUXURY_NEGATIVES : [];
    return cleanList([...BASE_IMAGE_NEGATIVES, ...TEXT_RENDERING_NEGATIVES, ...contextualImageNegatives(input), ...luxNegatives]);
  }

  const negatives = [...BASE_VIDEO_NEGATIVES];
  if (input.outputType === "talking_video") {
    negatives.push(...TALKING_VIDEO_NEGATIVES);
  }
  if (input.targetModel === "veo") {
    negatives.push(...VEO_TEXT_NEGATIVES);
  }
  return cleanList(negatives);
}

// F0.5 — helper to compile image-only negatives without a full PromptDirectorInput
// (used when generateSoulImage is called without access to scene/archetype context).
// F1 — pass luxuryWorldEnabled (character's luxury_world_v1 flag) to also append the
// premium-environment negatives at the API call site.
export function getBaseImageNegatives(luxuryWorldEnabled?: boolean): string {
  const lux = luxuryWorldEnabled ? LUXURY_NEGATIVES : [];
  return [...BASE_IMAGE_NEGATIVES, ...TEXT_RENDERING_NEGATIVES, ...lux].join(", ");
}

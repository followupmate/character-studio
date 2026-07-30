import type { ShotDirection } from "@/lib/shotDirection";

// PRODUCTION SEEDANCE PROMPT COMPILER — compiles ShotDirection(s) into a short, hierarchical
// prompt for Higgsfield's Seedance video model (bytedance/seedance/v1/pro/image-to-video).
// Verified against the real API + official prompting guide (docs.higgsfield.ai,
// higgsfield.ai/blog/seedance-prompting-guide): the endpoint takes only { image_url, prompt } —
// duration/aspect ratio are NOT separate JSON fields, they live in the prompt text itself.
//
// Never emits business vocabulary (paid_promise/content_level/erotic_tease/premium_sensual/
// payoff/paid) or negated collage/panel language — see lib/imagePromptCompiler.ts's
// BANNED_COLLAGE_TERMS, reused here for the same reason (real-draft finding: negating what you
// don't want primed the model toward rendering exactly that).

export type SeedanceFormat = "single_shot" | "multi_shot" | "continuous_pov";

// Tightened from 700/1600: every real call this compiler feeds (lib/klingProvider.ts) is
// image-to-video, and Kling's own prompting guide says a tight 60-100 word prompt outperforms a
// maxed-out one — the source image already carries identity/wardrobe/lighting, so the prompt only
// needs to carry movement + camera direction (see shotContentLines below).
export const MAX_SINGLE_SHOT_PROMPT_LENGTH = 500;
export const MAX_MULTI_SHOT_PROMPT_LENGTH = 1100;

export interface SeedancePromptInput {
  format: SeedanceFormat;
  duration_seconds: number;
  aspect_ratio: "9:16" | "16:9" | "4:5";
  identity: string;
  continuity: string;
  shots: ShotDirection[];
  visual_style: string;
  audio?: string;
}

const ASPECT_LABEL: Record<SeedancePromptInput["aspect_ratio"], string> = {
  "9:16": "vertical 9:16",
  "16:9": "horizontal 16:9",
  "4:5": "vertical 4:5",
};

const SINGLE_SHOT_CLOSE_LOCK = "One adult woman, one body position, one continuous moment.";
const NO_AUDIO_LOCK = "NO MUSIC. NO DIALOGUE. NO SOUND EFFECTS.";
const CONTINUOUS_TAKE_LOCK = "One continuous take, camera never cuts.";

const MIN_FIELD_LEN = 18;

// Caps a raw field VALUE (not an assembled block) at a word boundary, no ellipsis — ShotDirection
// fields carry rich, multi-clause text (see lib/shotDirection.ts's pickWardrobeState, which can
// concatenate wardrobe/material/accessory/footwear into 200+ chars); Seedance needs short,
// concrete per-shot direction, so each field is shortened BEFORE assembly rather than truncating
// the assembled block (which would silently drop whichever line lands last, usually
// pose/wardrobe — exactly the visual direction the shot needs most).
function capField(text: string, maxLen: number): string {
  if (maxLen < 1) return "";
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.4 ? lastSpace : maxLen;
  return slice.slice(0, cut).trim();
}

// Every real call this compiler feeds is image-to-video (lib/klingProvider.ts always passes a
// source image). Kling's own prompting guide is explicit about this case: "Drop Subject and Scene
// descriptions since the image already supplies them" and lead with Subject Movement + Camera
// Language instead — restating pose/wardrobe/lighting the source frame already shows wastes
// budget and can compete with the image for what the model actually renders. So the video prompt
// carries only what the image CAN'T show: what happens next, and how the camera moves.
//
// single_shot -> movement + camera only (2 lines). multi_shot/continuous_pov keep one short
// wardrobe-delta line too, because that's the one thing carrying the escalation narrative across
// the arc (bridge -> payoff) that a single static source frame can't otherwise convey.
function shotContentLines(shot: ShotDirection, fieldBudget: number, includeWardrobeDelta: boolean): string[] {
  const usable = Math.max(0, fieldBudget - 24); // reserved for connectors/punctuation
  const actionCap = Math.max(MIN_FIELD_LEN, Math.round(usable * (includeWardrobeDelta ? 0.35 : 0.55)));
  const motionCap = Math.max(14, Math.round(usable * 0.25));
  const wardrobeCap = includeWardrobeDelta ? Math.max(MIN_FIELD_LEN, Math.round(usable * 0.3)) : 0;

  const action = capField(shot.visible_action.replace(/^she\s+/i, ""), actionCap);
  const motion = capField(shot.camera_motion ?? "", motionCap);
  const framingLine = `${shot.framing} shot, ${shot.camera_angle}${motion ? `, ${motion}` : ""}`;

  const lines = [`She ${action}.`, `${framingLine}.`];
  if (includeWardrobeDelta) {
    const wardrobe = capField(shot.wardrobe_state, wardrobeCap);
    lines.push(`${wardrobe}.`);
  }
  return lines;
}

function truncateAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastBlank = slice.lastIndexOf("\n\n");
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
  const cut = Math.max(lastBlank, lastStop);
  if (cut > 0) return slice.slice(0, cut + 1).trim();
  return slice.trim();
}

// Collapses EXACT duplicate sentences/lines anywhere in the assembled prompt — catches a real
// duplication bug (e.g. two shots accidentally sharing byte-identical content) without touching
// intentionally-repeated short lock phrases, since those are compared as whole lines, not
// substrings.
function dedupeLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split("\n")
    .filter((line) => {
      const key = line.trim().toLowerCase();
      if (key === "" ) return true; // keep blank lines (structure)
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

export interface ShotConflictCheck {
  passes: boolean;
  reasons: string[];
}

// §5 doctrine: no two shots may share byte-identical pose+wardrobe (a real duplication signal,
// not stylistic repetition — short camera/lighting phrases repeating across shots is normal and
// NOT flagged here). Framing is a typed enum (lib/shotDirection.ts's ShotFraming) so "wide and
// close in one shot" is structurally impossible — this only checks CROSS-shot duplication.
export function checkShotConflicts(shots: ShotDirection[]): ShotConflictCheck {
  const reasons: string[] = [];
  const seenPoseWardrobe = new Map<string, number>();
  for (const shot of shots) {
    const key = `${shot.pose}|${shot.wardrobe_state}`.toLowerCase();
    seenPoseWardrobe.set(key, (seenPoseWardrobe.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seenPoseWardrobe) {
    if (count > 1) reasons.push(`${count} shots share byte-identical pose+wardrobe ("${key.slice(0, 60)}...") — each shot must be visually distinct`);
  }
  return { passes: reasons.length === 0, reasons };
}

// Reserve-front-and-tail strategy (mirrors lib/imagePromptCompiler.ts's SINGLE_FRAME_LOCK
// handling): the header, identity/continuity, and the trailing lock (single_shot's close lock +
// audio, or multi_shot's Style/audio lines) must NEVER be truncated away — only the per-shot
// content in between is budget-constrained, via shotContentLines' field-level capping above.
export function compileSeedancePrompt(input: SeedancePromptInput): string {
  const n = input.shots.length;
  const aspectLabel = ASPECT_LABEL[input.aspect_ratio];
  const cap = input.format === "single_shot" ? MAX_SINGLE_SHOT_PROMPT_LENGTH : MAX_MULTI_SHOT_PROMPT_LENGTH;

  if (input.format === "single_shot") {
    const header = `Single continuous shot, ${input.duration_seconds} seconds, ${aspectLabel}.`;
    const identityLine = `${input.identity}. ${input.continuity}.`;
    const audioLine = input.audio ?? NO_AUDIO_LOCK;
    const front = `${header}\n\n${identityLine}`;
    const tail = `${SINGLE_SHOT_CLOSE_LOCK}\n\n${audioLine}`;
    const shotBudget = Math.max(80, cap - front.length - tail.length - 4);
    const shotBlock = dedupeLines(shotContentLines(input.shots[0], shotBudget, false).join("\n"));
    const assembled = `${dedupeLines(front)}\n\n${shotBlock}\n\n${dedupeLines(tail)}`.replace(/\n{3,}/g, "\n\n").trim();
    return assembled.length <= cap ? assembled : truncateAtBoundary(assembled, cap);
  }

  const header = `${n} shot${n === 1 ? "" : "s"}, ${input.duration_seconds} seconds total, ${aspectLabel}.`;
  const identityLine = `${input.identity}. ${input.continuity}.`;
  const frontParts = [header, identityLine];
  if (input.format === "continuous_pov") frontParts.push(CONTINUOUS_TAKE_LOCK);
  const front = frontParts.join("\n\n");

  const tailParts = [`Style: ${input.visual_style}.`];
  if (input.audio) tailParts.push(input.audio);
  const tail = tailParts.join("\n\n");

  const separatorSlack = (n + 1) * 2; // "\n\n" between front/shots/tail and between shot blocks
  const perShotBudget = Math.max(60, Math.floor((cap - front.length - tail.length - separatorSlack) / n));
  // Dedup runs PER SECTION (front, each shot block, tail) rather than across the whole assembled
  // string — buildShotDirections() deliberately shares base pose/facial/lighting text across
  // beats (only the beat-specific suffix differs), so a global dedup silently stripped those
  // lines from every shot after the first, leaving later shots with almost no direction. Two
  // genuinely identical shots are instead surfaced as a warning by checkShotConflicts(), not
  // silently resolved by deleting content.
  const shotBlocks = input.shots.map((shot, i) => dedupeLines(`Shot ${i + 1}:\n${shotContentLines(shot, perShotBudget, true).join("\n")}`));

  const assembled = [dedupeLines(front), ...shotBlocks, dedupeLines(tail)].join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return assembled.length <= cap ? assembled : truncateAtBoundary(assembled, cap);
}

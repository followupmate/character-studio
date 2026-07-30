import type { ShotDirection } from "@/lib/shotDirection";

// PRODUCTION IMAGE PROMPT COMPILER — compiles a ShotDirection into a short, concrete prompt for
// Higgsfield Soul (still images). Replaces the old clause-stacking approach (5+ concatenated
// blocks, 1500+ chars/shot) that this session found causes multi-panel/collage/duplicate-person
// output on some real generations. This compiler only ever emits short, positive, concrete
// sentences — no negated lists, no business vocabulary (paid_promise/content_level/erotic_tease/
// premium_sensual/fanvue_tension/payoff never appear here — ShotDirection has already stripped
// them by construction, see lib/shotDirection.ts).

export const MAX_IMAGE_PROMPT_LENGTH = 700;

export const SINGLE_FRAME_LOCK = "A single natural photograph. One adult woman, one body position, one instant.";

// Never emit these — real-draft finding: negating collage/panel language primed the model toward
// producing exactly that. Exported so tests can assert absence directly against this same list.
export const BANNED_COLLAGE_TERMS = [
  "collage",
  "contact sheet",
  "panels",
  "panel",
  "split screen",
  "split-screen",
  "clones",
  "clone",
  "sequential phases",
  "throughout the entire set",
];

function truncateAtSentenceBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
  if (lastStop > 0) return slice.slice(0, lastStop + 1).trim();
  // No sentence boundary found within budget — hard cut, no ellipsis (an ellipsis inside a
  // provider prompt can itself get rendered as literal text by some models).
  return slice.trim();
}

// Caps a raw field VALUE (not the assembled prompt) at a clause boundary, no ellipsis — real
// GenerativeSituation fields (especially wardrobe/pose/facial text) run 150-500+ chars, often as
// one run-on sentence with commas/em-dashes but no internal period. Capping per-field BEFORE
// assembly guarantees all 7 content sections survive into the prompt; capping the assembled
// string afterward (the old approach) silently dropped whichever sections landed last — a real
// production draft lost facial_expression/framing/lighting entirely this way. Prefers cutting at
// the last comma/em-dash/semicolon (a natural clause break) over a raw word boundary, so a
// truncated field reads as "a complete shorter clause" rather than trailing off mid-phrase.
function capField(text: string, maxLen: number): string {
  if (maxLen < 1) return "";
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastClauseBreak = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf(" — "), slice.lastIndexOf("; "));
  if (lastClauseBreak > maxLen * 0.35) return slice.slice(0, lastClauseBreak).trim();
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.4 ? lastSpace : maxLen;
  return slice.slice(0, cut).trim();
}

// Per-field budgets sized so the 7 sections + SINGLE_FRAME_LOCK fit comfortably within
// MAX_IMAGE_PROMPT_LENGTH even when every field is at its capped maximum (sum of caps + fixed
// connector/punctuation overhead stays well under the 700-char budget, leaving headroom rather
// than relying on the last-resort truncateAtSentenceBoundary below to claw back overflow).
//
// location/spatial were widened (and pose/wardrobe/bodyEmphasis trimmed to make room) after a
// real production finding: Higgsfield Soul has no "Location ID" equivalent to Soul ID — the
// official Soul ID writeup confirms it's deliberately environment-independent ("holds up across
// dramatically different scenes... because it learned the character independently of any single
// photo's context") — so environment continuity across independently-generated shots can only
// come from the text itself, and the old budget gave it less room than wardrobe/pose.
const FIELD_CAPS = {
  subject: 50,
  action: 42,
  location: 65,
  spatial: 92,
  pose: 65,
  bodyEmphasis: 24,
  wardrobe: 72,
  facial: 48,
  cameraMotion: 22,
  lighting: 26,
  atmosphere: 18,
  visualStyle: 30,
};

// Exact 8-part order per spec: subject+moment -> location/spatial zone -> pose+body emphasis ->
// wardrobe state -> expression/camera relationship -> framing+camera angle -> light+atmosphere ->
// single-frame lock.
export function compileImagePrompt(shot: ShotDirection, visualStyle: string): string {
  const contentParts = [
    `${capField(shot.subject, FIELD_CAPS.subject)}, ${capField(shot.visible_action, FIELD_CAPS.action)}.`,
    `${capField(shot.location, FIELD_CAPS.location)} — ${capField(shot.spatial_zone, FIELD_CAPS.spatial)}.`,
    `${capField(shot.pose, FIELD_CAPS.pose)}, ${capField(shot.body_emphasis, FIELD_CAPS.bodyEmphasis)}.`,
    `${capField(shot.wardrobe_state, FIELD_CAPS.wardrobe)}.`,
    `${capField(shot.facial_expression, FIELD_CAPS.facial)}.`,
    `${shot.framing} shot, ${shot.camera_angle}${shot.camera_motion ? `, ${capField(shot.camera_motion, FIELD_CAPS.cameraMotion)}` : ""}.`,
    `${capField(shot.lighting, FIELD_CAPS.lighting)}, ${capField(shot.atmosphere, FIELD_CAPS.atmosphere)}. ${capField(visualStyle, FIELD_CAPS.visualStyle)}.`,
  ];
  const content = contentParts.join(" ").replace(/\s+/g, " ").trim();

  // Reserve room for the lock (+1 for the joining space) so it can NEVER be partially truncated —
  // it must always appear complete and verbatim, or its purpose (positive-only single-frame
  // instruction) is defeated.
  const contentBudget = MAX_IMAGE_PROMPT_LENGTH - SINGLE_FRAME_LOCK.length - 1;
  const truncatedContent = truncateAtSentenceBoundary(content, contentBudget);
  return `${truncatedContent} ${SINGLE_FRAME_LOCK}`;
}

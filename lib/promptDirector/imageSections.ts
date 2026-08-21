import type { PromptDirectorInput } from "./types";
import { archetypeAllowsProp, cleanList, isCloseUpArchetype, sacredAnatomyAnchors, sacredList } from "./helpers";

// Deterministic IMAGE section builders (spec §7). These never call an LLM — every fact comes
// from sceneBrief / character.sacredDetails / slot, per the "no invention" rule (§7B / §22).
//
// This file is the Soul 2.0 (soul2) compiler in practice: "image" is the only outputType routed
// here, and soul2 is the only PromptDirectorTargetModel with supportsImage:true (see
// lib/promptDirector/constants.ts MODEL_CAPABILITIES). Shaped per Higgsfield's Soul 2.0 guidance:
// short, front-loaded, VISUAL-ONLY prompts — most important visual info first, no restating core
// identity/wardrobe-policy facts once Soul ID is doing that job, and — per the day-82 production
// incident below — no internal workflow/meta language of any kind.
//
// PRODUCTION INCIDENT (2026-08-21, day 82, reel_start_frame): slot.framing (lib/archetypeDeck.ts)
// is shared verbatim with the legacy Nano Banana path (lib/slotPrompts.ts: `SLOT FRAMING:
// ${args.slot.framing}`), but Nano Banana feeds it to an LLM rewrite step that naturally
// paraphrases away workflow language. Prompt Director is fully deterministic (see comment above —
// "never call an LLM"), so the SAME raw text — "fed to image-to-video (Kling / Seedance)",
// "CRITICAL: ... this frame is the identity anchor the video animates from", "Space for the
// overlay." — reached Higgsfield completely unfiltered. Higgsfield rendered visible TEXT into the
// image, almost certainly primed by the leaked "text overlay" phrasing. sanitizeFramingForSoul2()
// below is the fix: deterministic, non-LLM translation of slot.framing into visual-only facts,
// with a forbidden-term safety net and a default "no text" negative as defense in depth.

// §7A — IDENTITY / REFERENCE, split into two PromptPackage sections: `reference` (the strict
// "use the provided image" block, only when there IS a reference image) and `identity` (facts
// that always apply, image or not).
export function buildReferenceSection(input: PromptDirectorInput): string[] {
  if (!input.hasReferenceImage) return [];
  return cleanList([
    "Use the provided image as strict identity reference.",
    "Preserve exact facial identity and facial proportions.",
    "Preserve hairstyle, body proportions and visible identity details.",
    "Do not beautify, idealize or reinterpret the person.",
  ]);
}

// Which anatomy_anchors KEYS are actually visible per archetype — mirrors lib/slotPrompts.ts's
// ANATOMY ANCHOR rule verbatim (hands_object -> hands, fabric_texture -> neck/collarbone,
// emotional_close -> jawline, over_shoulder -> neck/shoulders). An archetype not listed here shows
// no reliably-identifiable body part close, so it gets no anchor at all.
const ANATOMY_RELEVANCE: Record<string, string[]> = {
  hands_object: ["hands", "wrists", "forearms"],
  interaction_object: ["hands", "wrists", "forearms"],
  fabric_texture: ["neck", "collarbone"],
  over_shoulder: ["neck", "shoulders", "collarbone"],
  emotional_close: ["jawline", "neck"],
};

// Relevance-filtered anatomy anchor lines for THIS framing only (§ "Relevance filtering" — an
// anchor is only worth a word budget line when the archetype actually puts that body part on
// screen). `labeled` controls whether the line carries an explicit "Anatomy anchor (part):"
// prefix — used for the no-Soul-ID full brief, dropped for the Soul ID short cue where every word
// counts.
function anatomyAnchorLines(input: PromptDirectorInput, labeled: boolean): string[] {
  const relevantParts = ANATOMY_RELEVANCE[input.archetypeId] ?? [];
  if (relevantParts.length === 0) return [];
  const anchors = sacredAnatomyAnchors(input.character.sacredDetails);
  const lines: string[] = [];
  for (const part of relevantParts) {
    const marker = anchors[part];
    if (marker) lines.push(labeled ? `Anatomy anchor (${part}): ${marker}` : marker);
  }
  return lines;
}

export function buildIdentitySection(input: PromptDirectorInput): string[] {
  if (input.character.soulId) {
    // F0.2 — Soul ID behavior (Higgsfield Soul 2.0 guidance): identity/wardrobe-anchor/never-show
    // policy and the Soul ID UUID are the platform's job, not the prompt's — restating them burns
    // word budget on facts Soul ID already enforces. Replace meta "Same character identity as the
    // Soul ID reference" with neutral visual lock.
    return cleanList(["One woman alone in the frame.", ...anatomyAnchorLines(input, false)]);
  }

  // No Soul ID on file — nothing on the platform enforces identity, so the full brief is the only
  // thing keeping the character consistent across generations.
  const lines: string[] = [`Character visual brief: ${input.character.visualBrief}`];
  const wardrobeAnchors = sacredList(input.character.sacredDetails, "wardrobe_anchors");
  if (wardrobeAnchors.length > 0) {
    lines.push(`Wardrobe anchors (always present, never substituted): ${wardrobeAnchors.join("; ")}`);
  }
  const neverShow = sacredList(input.character.sacredDetails, "never_show");
  if (neverShow.length > 0) {
    lines.push(`Never show: ${neverShow.join("; ")}`);
  }
  lines.push(...anatomyAnchorLines(input, true));
  return cleanList(lines);
}

// ── Shared word-budget helpers ──────────────────────────────────────────────────────────────
// Hard per-section caps for the Soul 2.0 profile (production incident follow-up — see file
// header). Not a "try to stay under" target: capWords()/capSection() structurally truncate, so
// the compiled prompt can never exceed these regardless of how verbose the upstream SceneBrief/
// slot.framing text is. Sub-budgets inside SCENE (spatial/wardrobe/prop) are allocated so no
// single long fact can silently starve the others of their share of the section's word count.
// F0.6 — expanded budgets (180→220, scene 45→70, spatial 28→45) to preserve atmosphere detail
export const SOUL2_WORD_BUDGET = {
  // slot.framing gets its OWN sub-budget rather than sharing the flat camera cap — a long
  // sanitized framing string must never be able to silently push shot-size/camera_language out
  // of a shared cap the way an earlier version of this file did.
  cameraFraming: 22,
  camera: 35,
  pose: 30,
  sceneSpatial: 45, // increased from 28 to preserve spatial detail
  sceneWardrobe: 20, // increased from 14
  scene: 70, // increased from 45
  lighting: 25, // increased from 20
  // F3 — aesthetic carries tier direction + mood + the day's photo-style cue; 13 words silently
  // truncated the style cue away, so the budget grows with the section's new content.
  aesthetic: 22,
  realism: 12,
  total: 220, // increased from 180
} as const;

// Truncates to at most maxWords words WITHOUT ever cutting a clause/detail mid-way (production
// cleanup — the previous word-boundary cut could produce a dangling fragment like "thin single
// delicate.."). Real SceneBrief/wardrobe prose is a run of comma/semicolon/em-dash separated
// DETAILS (lib/sceneBrief.ts's own doctrine writes it that way), so the correct unit to drop when
// something doesn't fit the budget is a WHOLE detail, never part of one. The first detail is
// always kept in full even if it alone exceeds the budget — a complete fact that slightly
// overshoots its budget beats an empty or fragmented result. Only falls back to a hard
// word-boundary cut when the text has no clause punctuation at all to snap to (e.g. a run of
// space-joined tokens with no commas/periods anywhere).
function capWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.split(/\s+/).filter(Boolean).length <= maxWords) return trimmed;

  const clauses = (trimmed.match(/[^,;.—]+[,;.—]?/g) ?? []).map((c) => c.trim()).filter(Boolean);
  if (clauses.length <= 1) {
    const words = trimmed.split(/\s+/).slice(0, maxWords).join(" ");
    return /[.!?]$/.test(words) ? words : `${words}.`;
  }

  let result = "";
  let wordCount = 0;
  for (const clause of clauses) {
    const clauseWordCount = clause.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) {
      result = clause;
      wordCount = clauseWordCount;
      continue;
    }
    if (wordCount + clauseWordCount > maxWords) break;
    result += ` ${clause}`;
    wordCount += clauseWordCount;
  }

  result = result.replace(/[,;—]\s*$/, "").trim();
  return /[.!?]$/.test(result) ? result : `${result}.`;
}

// Final hard backstop applied to every rendered Soul 2.0 section — even if the section's own
// compression logic under- or over-shoots, the assembled text can never exceed its word budget.
// Exported so compiler.ts can apply the SAME cap to `pose`, which is identity + this section's
// output COMBINED (see buildImageSections) — capping only in here would miss whatever identity
// contributes once the two are merged.
export function capSection(lines: string[], maxWords: number): string[] {
  const joined = cleanList(lines).join(" ").replace(/\s{2,}/g, " ").trim();
  if (!joined) return [];
  return [capWords(joined, maxWords)];
}

// §"SUBJECT ACTION / POSE" — Soul 2.0's item 2. Pulls the concrete visible action out of
// situationTranslation's structured block (rather than dumping the whole multi-paragraph
// SITUATION text, which alone can blow the word budget). Never invents an action — if
// situationTranslation has none, this legitimately returns []. Deliberately does NOT fall back to
// archetypeGuidance: that field is directorial/meta guidance to whoever is composing the shot
// ("Establish the room before she enters it.", "Punchline of the visual sentence."), not a visual
// fact about the frame, and reads as an out-of-place meta-sentence if it reaches the model as-is.
//
// TODO: extractVisibleAction() depends on the exact "- Visible action \ pose: ..." line format
// emitted by translateSituationForSlotPrompt() in lib/situationPlanner.ts. If that upstream
// template's wording changes, this regex silently stops matching (falls back to no pose line)
// rather than throwing — worth a shared fixture/contract test if that template is ever revised.
function extractVisibleAction(situationTranslation?: string): string | undefined {
  if (!situationTranslation) return undefined;
  const match = situationTranslation.match(/Visible action\s*\\?\s*pose:\s*([^\n]+)/i);
  return match?.[1]?.trim();
}

// §21 — FIRST FRAME FOR VIDEO, rewritten as pure visual facts (production incident follow-up —
// the old version literally opened with "First-frame prep — this image is planned as an
// image-to-video start frame:", which is exactly the kind of internal-workflow sentence this file
// must never emit). Each branch keeps only the observable pose/expression fact and drops the
// "why" (e.g. "forces the video model to invent a different face", "can't naturally continue into
// speech") — Higgsfield needs the instruction, never the reasoning behind it. Lives in the POSE
// section, not camera — "face visible", "mid-step" are pose facts, and giving them their own
// section (rather than competing with slot.framing for camera's word budget) is what stops a
// long framing string from silently pushing them out entirely, which an earlier version of this
// fix actually did.
function firstFramePrepLines(input: PromptDirectorInput): string[] {
  const intent = input.plannedVideoIntent;
  if (!intent) return [];

  if (intent.mode === "talking_to_camera") {
    return cleanList(["Face fully visible and turned toward camera, mouth unobstructed.", "Near-neutral expression.", "Hands clear of the face."]);
  }
  if (/walk|step|stride/i.test(intent.action ?? "")) {
    return ["Natural mid-step or ready-to-move pose, with open space in the direction of movement."];
  }
  return ["Pose anatomically sustainable as a natural starting position."];
}

// NOT capped to SOUL2_WORD_BUDGET.pose here — compiler.ts combines this with `identity` before
// the pose section is final, and only the COMBINED text should be capped (capping here too would
// double-truncate and isn't wrong, just redundant; left uncapped for clarity of where the one
// real cap lives).
export function buildPoseActionSection(input: PromptDirectorInput): string[] {
  return cleanList([extractVisibleAction(input.situationTranslation) ?? null, ...firstFramePrepLines(input)]);
}

// ── slot.framing sanitization (production incident fix) ────────────────────────────────────
// slot.framing (lib/archetypeDeck.ts DAILY_SLOTS / DISCOVERY_FRAMING / DEPTH_FRAMING /
// lib/reelFormats.ts coverCue) is prose written for a human operator or an LLM rewrite step, not
// for verbatim delivery to an image model. sanitizeFramingForSoul2() is a deterministic (no LLM)
// translation layer, soul2-only — it does NOT touch the shared SlotSpec.framing string itself, so
// Nano Banana (lib/slotPrompts.ts) keeps receiving exactly what it always has.

// F0.1 — Direct visual framing descriptors per slot (no meta-language, no internal references)
type SlotName = "carousel_1" | "carousel_2" | "carousel_3" | "carousel_4" | "carousel_5" | "reel_start_frame" | "story_bts";
const SOUL2_SLOT_FRAMING: Partial<Record<SlotName, string>> = {
  carousel_1: "Wide establishing shot, subject small in a layered environment, off-center composition.",
  carousel_2: "Medium shot, subject present in the space, natural stance.",
  carousel_3: "Close detail shot of hands, fabric or surface texture, face out of frame.",
  carousel_4: "Medium close-up, subject absorbed in the moment, not looking at camera.",
  carousel_5: "Close-up on face, direct expressive moment, eyes carrying the emotion.",
  reel_start_frame: "Vertical 9:16 shot with one clearly dominant subject and immediate visual focus, single continuous scene, subject mid-action in a natural sustainable pose, face clearly visible, clean negative space in the top third.",
  story_bts: "Vertical 9:16 candid frame, relaxed unposed moment, natural imperfect framing.",
};

const SOUL2_FORBIDDEN_TERMS = [
  "kling",
  "seedance",
  "image-to-video",
  "reel_video",
  "identity anchor",
  "video model",
  "fed to",
  "critical:",
  "first-frame prep",
  "plannedvideointent",
  "workflow",
  "scenebrief",
  // Second cleanup pass — internal production/slot vocabulary that isn't "workflow" language in
  // the Kling/Seedance sense, but is equally not a visual fact Higgsfield should ever see.
  "reel cover",
  "stop-scroll",
  "first frame",
  "carousel",
  "overlay",
  "scene lock",
  // F0.1 — meta-references to other shots or video continuation (replaces "the earlier shot" rewrite with filtering)
  "earlier shot",
  "previous shot",
  "the shot",
  "motion continues",
  "continues from",
  "soul id",
  "reference",
];

// Ordered, first-match rewrites for the SPECIFIC patterns actually present in
// lib/archetypeDeck.ts / lib/reelFormats.ts today. Each keeps the real visual fact and drops the
// workflow/meta wrapper around it — this is what "deterministic semantic extraction" means here:
// a fixed rule per known pattern, not a generic paraphraser.
const TARGETED_FRAMING_REWRITES: Array<[RegExp, string]> = [
  // "First frame of the 9:16 vertical reel — fed to image-to-video (Kling / Seedance)."
  [/First frame of the [^.]*?fed to image-to-video[^.]*\./i, "Vertical framing."],
  // "CRITICAL: her FACE MUST be clearly visible and turned toward camera (at least head-and-
  // shoulders in frame, eyes visible) — this frame is the identity anchor the video animates
  // from; a cropped, headless, profile or face-away frame forces the video model to invent a
  // different face (loses NAME)."
  [/CRITICAL:[^.]*?FACE MUST be clearly visible and turned toward camera[^.]*?eyes visible\)[^.]*\./i, "Face fully visible and turned toward camera, eyes visible."],
  // "Leave room for the reel_video motion." — internal slot-name reference; the same fact is
  // already covered by firstFramePrepLines()'s plannedVideoIntent-derived pose line.
  [/\s*Leave room for the reel_video motion\.?/i, ""],
  // "(Face clearly visible — a headless / face-away frame makes the video model invent a new
  // face.)"
  [/\(Face clearly visible[^)]*video model[^)]*\)\.?/i, "Face clearly visible."],
  // "built from the image not text." — directorial brief language, not a visual fact, and
  // mentions "text" (the exact priming risk this fix exists for).
  [/,?\s*built from the image not text\.?/i, "."],
  // Any "(leave/empty) space (in the top third) for (an optional/the/a) (text) overlay (added
  // later)" phrasing, in any of the ~7 reelFormat.coverCue variants — collapses to one clean
  // composition fact with no "overlay"/"text" wording at all.
  [/(?:Leave\s+)?(?:empty\s+)?[Ss]pace\s+(?:in the top third\s+)?for\s+(?:an?\s+optional\s+)?(?:the\s+|a\s+)?(?:text\s+)?overlay(?:\s+added later)?\.?/g, "Leave empty space in the top third."],
  // "FORMAT — <label>: <content>" — strip the internal FORMAT label, keep the substantive
  // pose/mood direction that follows it.
  [/FORMAT\s*—\s*[^:]+:\s*/i, ""],
  // DEPTH_FRAMING's internal "scene lock" terminology and "Do NOT invent... the scene lock
  // excludes" reasoning — the real visual instruction (layer foreground/midground/background, no
  // invented props) survives; the explanation does not.
  [/DEPTH & COMPOSITION:[\s\S]*?natural layers instead of adding things\.?/i, "Build depth with foreground, midground and background layers across the existing surfaces; no added props or furniture."],
  // "REEL COVER — stop-scroll first frame." (DISCOVERY_FRAMING) — internal production label for
  // "the still image that has to stop a scrolling thumb"; the visual intent is a single dominant
  // subject with immediate focus, not the label itself. Must run AFTER the "built from the image
  // not text" rule above so the comma-continuation is already gone and this matches the clean
  // sentence boundary.
  [/REEL COVER\s*—\s*stop-scroll first frame\.?/i, "Vertical 9:16 shot with one clearly dominant subject and immediate visual focus."],
];

function sanitizeFramingForSoul2(rawFraming: string): string {
  let text = rawFraming;
  for (const [pattern, replacement] of TARGETED_FRAMING_REWRITES) {
    text = text.replace(pattern, replacement);
  }

  // Safety net: split into sentences, drop any that still contain a forbidden term (this file
  // has never seen it before, or a targeted rule above missed a variant) rather than risk a
  // partial leak, then dedupe sentences the rewrites above can produce near-duplicates of — e.g.
  // the REEL COVER rewrite introduces its own "Vertical 9:16 shot..." while the SAME framing
  // string independently has a later, separate "Vertical 9:16." sentence. Exact-match dedup alone
  // wouldn't catch that (different text), so a kept sentence also blocks any later one sharing
  // its first three words.
  const seen = new Set<string>();
  const seenPrefixes = new Set<string>();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const lower = s.toLowerCase();
      if (SOUL2_FORBIDDEN_TERMS.some((term) => lower.includes(term))) return false;
      if (seen.has(lower)) return false;
      const prefix = lower.split(/\s+/).slice(0, 3).join(" ");
      if (prefix.length > 3 && seenPrefixes.has(prefix)) return false;
      seen.add(lower);
      seenPrefixes.add(prefix);
      return true;
    });

  return sentences.join(" ").replace(/\s{2,}/g, " ").trim();
}

// §7B — SCENE / MICRO-LOCATION. spatial_setup and wardrobe_lock are source-of-truth FACTS, not
// prose to copy verbatim — a real production SceneBrief's spatial_setup runs 120-160+ words on
// its own (lib/sceneBrief.ts's own doctrine), which alone blows any usable prompt budget.
// compressSpatialSetup()/compressWardrobe() preserve the leading (highest-priority, per that same
// doctrine: foreground/immediate-location facts first, distant background elaboration last) part
// of each fact within its own sub-budget, rather than truncating the whole SCENE block blindly
// (which would silently starve wardrobe of any words at all behind a long spatial_setup).
// location_constraints is dropped entirely: lib/sceneBrief.ts already bakes its content into
// spatial_setup (confirmed against real production data), so it never carries new information.
function stripParentheticals(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

function compressSpatialSetup(spatialSetup: string): string {
  return capWords(spatialSetup, SOUL2_WORD_BUDGET.sceneSpatial);
}

function compressWardrobe(wardrobeLock: string): string {
  return capWords(stripParentheticals(wardrobeLock), SOUL2_WORD_BUDGET.sceneWardrobe);
}

export function buildSceneSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const lines: string[] = [compressSpatialSetup(sb.spatial_setup)];

  if (sb.environment_anchor && !sb.spatial_setup.includes(sb.environment_anchor)) {
    lines.push(`${sb.environment_anchor}.`);
  }

  // compressWardrobe() already guarantees its own terminal punctuation (via capWords) when it
  // truncates, but returns the raw (unpunctuated) fact verbatim when it fits — strip any
  // pre-existing terminator before adding this template's own "." so the result is never
  // double-punctuated ("...barefoot..").
  lines.push(`Wearing ${compressWardrobe(sb.wardrobe_lock).replace(/[.!?]+$/, "")}.`);
  if (sb.pet_lock) lines.push(`With ${sb.pet_lock}.`);

  const allowedProps = sb.allowed_props ?? [];
  if (archetypeAllowsProp(input.archetypeId) && allowedProps.length > 0) {
    lines.push(`May hold: ${allowedProps.join(" or ")}.`);
  } else {
    lines.push("Empty hands, nothing held.");
  }

  return capSection(lines, SOUL2_WORD_BUDGET.scene);
}

// Wardrobe/animal lock as its own PromptPackage section (kept separate from `scene` per the
// PromptPackage shape) — always locked verbatim from sceneBrief, never invented (§7B "NO
// INVENTION RULE"). Not rendered as its own block in the Soul 2.0 profile (its content is folded,
// compressed, into `scene`, see buildSceneSection above) but kept populated here for
// callers/tests that read `sections.appearance` directly (this section is NOT subject to the
// Soul 2.0 word budget — it's a data/provenance field, not rendered prompt text).
export function buildAppearanceSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  return cleanList([
    `Wardrobe lock (exhaustive, no substitutions): ${sb.wardrobe_lock}`,
    sb.pet_lock ? `Animal lock (same individual every time): ${sb.pet_lock}` : null,
  ]);
}

// §7C — CAMERA / "SHOT / FRAMING / CAMERA" (Soul 2.0's item 1 — leads the prompt). slot.framing
// is run through sanitizeFramingForSoul2() first (see above), then capped to its OWN sub-budget
// BEFORE joining with shot-size/camera_language — a long sanitized framing string must never be
// able to push those out of a shared cap entirely, which an earlier version of this fix did.
// F0.1 — prefer SOUL2_SLOT_FRAMING[slot] when available (direct visual facts), fallback to
// sanitized input.slot.framing for unknown slots (backward-compatible).
export function buildCameraSection(input: PromptDirectorInput): string[] {
  const slotName = (input.slot.slot as SlotName | undefined) ?? undefined;
  const framingText = (slotName && SOUL2_SLOT_FRAMING[slotName]) ?? sanitizeFramingForSoul2(input.slot.framing);
  const framingLine = capWords(framingText, SOUL2_WORD_BUDGET.cameraFraming);
  const lines: string[] = [framingLine];
  if (isCloseUpArchetype(input)) {
    lines.push("close framing, face or detail fills a large part of the frame");
  } else if (input.slot.family === "environment") {
    lines.push("wide shot, subject embedded in environment");
  } else {
    lines.push("medium shot");
  }
  lines.push(input.sceneBrief.camera_language);
  return capSection(lines, SOUL2_WORD_BUDGET.camera);
}

// F0.4 — Humanize time_of_day enum to natural language (golden_hour → "golden hour light")
function humanizeTimeOfDay(timeOfDay: string): string {
  const map: Record<string, string> = {
    golden_hour: "golden hour light",
    blue_hour: "blue hour dusk",
    indoor_lamp: "warm lamp-lit interior",
    fluorescent: "cool artificial light",
    midday: "midday light",
    overcast: "overcast diffuse light",
    moonlight: "moonlight",
    dawn: "dawn light",
    dusk: "dusk light",
  };
  return map[timeOfDay] || timeOfDay.replace(/_/g, " ");
}

// §7D — LIGHTING. Real, concrete formulations — never "cinematic glow" / "dramatic studio light".
export function buildLightingSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const timeOfDayText = humanizeTimeOfDay(sb.time_of_day);
  const lines = cleanList([sb.lighting_state, `${timeOfDayText}, ${sb.weather_implied}`]);
  return capSection(lines, SOUL2_WORD_BUDGET.lighting);
}

// F3 — tier-derived editorial direction. Replaces the fixed "candid social-media realism" line
// that used to stamp every image with the same aesthetic fingerprint (and pushed the whole feed
// toward a phone-snap look that fights the luxury positioning). Tier unknown/absent falls back to
// the original fixed line, so pre-F3 callers keep byte-identical output.
const TIER_AESTHETIC: Record<string, string> = {
  intimate_aesthetic: "quiet editorial intimacy",
  lived_moments: "warm candid social energy",
  luxe_car: "polished nocturnal editorial",
  wellness_fitness: "clean morning athleticism",
  everyday_life: "effortless polished daily life",
  lifestyle_travel: "aspirational travel editorial",
};

// F3 — photography style deck, rotated deterministically per day (same seed pattern as
// lib/reelFormats.ts pickReelFormat) so the feed doesn't carry one uniform photographic
// signature. One short lens/exposure cue per day — never more.
export const PHOTO_STYLE_DECK = [
  "35mm editorial look, shallow depth of field",
  "50mm natural-light portrait feel",
  "medium-format editorial look, soft fine grain",
  "backlit golden exposure, restrained flare",
  "crisp daylight editorial, true-to-life color",
  "soft window-light exposure, gentle contrast",
] as const;

export function pickPhotoStyle(seed: number): string {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const i = ((s % PHOTO_STYLE_DECK.length) + PHOTO_STYLE_DECK.length) % PHOTO_STYLE_DECK.length;
  return PHOTO_STYLE_DECK[i];
}

// "AESTHETIC / EMOTIONAL DIRECTION" — Soul 2.0's item 5. Explicit medium/style + mood cues (per
// Higgsfield guidance: Soul 2.0 responds well to these), chosen from what the scene actually
// implies rather than a fixed list — never more than a handful of words.
export function buildAestheticSection(input: PromptDirectorInput): string[] {
  const sb = input.sceneBrief;
  const lines = [(input.tier && TIER_AESTHETIC[input.tier]) || "candid social-media realism"];
  lines.push(isCloseUpArchetype(input) ? "intimate, spontaneous energy" : "relaxed, natural body language");
  if (sb.time_of_day) lines.push(`${humanizeTimeOfDay(sb.time_of_day)} mood`);
  if (input.dayNumber != null) lines.push(pickPhotoStyle(input.dayNumber));
  return capSection(cleanList(lines), SOUL2_WORD_BUDGET.aesthetic);
}

// §7E — HUMAN REALISM / "MINIMAL REALISM CUES" — Soul 2.0's item 6. Deliberately capped at a
// handful of cues (2-4) rather than the full social-realism list — Soul 2.0 guidance is explicit
// that dumping every realism phrase on every shot is counter-productive. Close-up gets the
// stronger, face-specific set; a wide/full-body frame gets the lighter one.
export function buildRealismSection(input: PromptDirectorInput): string[] {
  // F3 — "natural phone exposure" only where the phone-snap look is the point (story_bts);
  // feed/reel slots keep editorial realism cues instead of being pushed toward a casual look.
  const lines = isCloseUpArchetype(input)
    ? ["natural skin texture", "visible pores", "subtle facial asymmetry", "real hair strands"]
    : ["natural skin texture", "realistic clothing folds", input.slot.slot === "story_bts" ? "natural phone exposure" : "true-to-life exposure"];
  return capSection(cleanList(lines), SOUL2_WORD_BUDGET.realism);
}

// §7F — MICRO IMPERFECTIONS. Only when the model/scene benefit from "real camera ≠ CGI render".
// Skipped for archetype families that don't read as phone-camera captures (kept conservative: on
// for subject/detail/bts families, which is where phone-camera imperfection reads as authentic;
// off for wide environment establishing shots where it adds nothing). Not rendered as its own
// block in the Soul 2.0 profile (folded into the realism cues above) but kept populated here for
// callers/tests that read `sections.imperfections` directly.
export function buildImperfectionsSection(input: PromptDirectorInput): string[] {
  if (input.slot.family === "environment") return [];
  return cleanList([
    "subtle sensor noise",
    "natural HDR behavior",
    "slight exposure inconsistency",
    input.slot.type === "photo" && isCloseUpArchetype(input) ? "phone lens distortion" : null,
  ]);
}

// Runtime safety net (production incident follow-up) — throws rather than silently shipping a
// Soul 2.0 prompt that still contains internal workflow/meta language. Called from compiler.ts
// only for outputType "image" (soul2). This is a genuine last-resort: every code path above
// should already guarantee a clean prompt, but a future edit to a section builder, or a new
// slot.framing pattern this file has never seen, should fail loudly here rather than reach
// Higgsfield unfiltered the way the day-82 incident did.
export function assertNoSoul2MetaLeakage(positivePrompt: string): void {
  const lower = positivePrompt.toLowerCase();
  const leaked = SOUL2_FORBIDDEN_TERMS.filter((term) => lower.includes(term));
  if (leaked.length > 0) {
    throw new Error(`Prompt Director (soul2): compiled prompt leaks internal workflow terms: ${leaked.join(", ")}`);
  }
}

// §7G — IMAGE NEGATIVE builder lives in lib/promptDirector/negativeBuilder.ts (shared with video).

import { claudeWithRetry } from "@/lib/generatePrompts";
import {
  pickTier,
  pickDriftSeeds,
  tierGuidance,
  locationSpecFor,
  driftSeedGuidance,
  pickMomentFamily,
  pickMagnetismLevel,
  getLastMomentFamily,
  StoryTier,
  ContentPhase,
} from "@/lib/storyTier";
import type { MomentFamily, MagnetismLevel, SexualEnergyLevel, ContinuityPhase } from "@/types";
import { Character } from "@/types";
import { isFlagOn } from "@/lib/featureFlags";
import { VOICE_DOCTRINE, DISCOVERY_DOCTRINE } from "@/lib/storyPrompt";
import {
  getLatestLifeState,
  getActiveLifeEvents,
  lifeContextBlock,
  LIFE_OUTPUT_SPEC,
  microEventPhaseCandidates,
  microEventOutputSpec,
  LifeEvent,
} from "@/lib/lifeState";
import { getGrowthBias } from "@/lib/growthScore";
import { allowedSexualEnergyLevels, sexualEnergyRangeGuidance, isActiveTier, pickSexualEnergyLevel } from "@/lib/sexualEnergyConfig";
import { pickPlayfulHotWorldProfile, playfulHotWorldGuidance } from "@/lib/playfulHotWorldConfig";
import { getSituationMemory, computeFrequencyPenalties, softAvoidCliches, weeklyBalanceNudges, situationMemoryGuidance, outfitCategoryNudges } from "@/lib/situationMemory";
import { SITUATION_OUTPUT_SPEC, situationSchemaBlock, extractSituation } from "@/lib/situationPlanner";
import { validateGenerativeSituation, SITUATION_MAX_ATTEMPTS, ValidationContext } from "@/lib/situationValidation";

// open_life_generation_v1 — orchestration extracted from app/api/characters/story/route.ts and
// app/api/characters/generate-forward/route.ts, which independently re-implemented (and had
// already drifted from each other on) the exact same buildSystemPrompt + tier/drift/life-layer
// selection logic. This module is a PURE ORCHESTRATOR: it calls into lib/storyTier.ts,
// lib/lifeState.ts, lib/sexualEnergyConfig.ts, lib/situationMemory.ts, lib/situationPlanner.ts
// and lib/situationValidation.ts, but never duplicates their rules inline. Each route keeps its
// own insert-payload shape and error-handling (fatal-throw for the cron route, per-day
// try/catch for the backfill route) — only the content-generation step is shared here.

export interface BuildSystemPromptArgs {
  character: Character;
  tier: StoryTier;
  driftSeeds: ContentPhase[];
  dayNumber: number;
  historyText: string;
  lifeContext?: string; // life_layer: continuity guidance from yesterday's life_state + active events
  discoveryMode?: boolean; // discovery_mode: reach-first caption/hook editorial
  family?: MomentFamily | null; // lived_moments: today's world
  magnetism?: MagnetismLevel | null; // lived_moments: today's intensity
  // open_life_generation_v1 — all optional/additive. Omitting every one of these reproduces the
  // exact pre-existing prompt string (see lib/storyGeneration.test.ts's byte-identical check).
  situationMode?: boolean;
  sexualEnergyGuidance?: string; // precomputed by lib/sexualEnergyConfig.ts, passed through to tierGuidance
  situationSchemaBlock?: string; // precomputed by lib/situationPlanner.ts's situationSchemaBlock — embedded INSIDE the scene JSON block
  situationOutputSpec?: string; // precomputed by lib/situationPlanner.ts's SITUATION_OUTPUT_SPEC — RULE/guidance text appended after the scene block
}

// Base = app/api/characters/story/route.ts's pre-extraction version — it carried a "VOICE
// ANCHOR" drift-reset line and fuller ig_caption/hook_text examples that
// generate-forward/route.ts's independent copy had drifted without. Byte-identical to that
// version whenever every open_life_generation_v1 field above is omitted.
export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
  const { character, tier, driftSeeds, historyText, lifeContext, discoveryMode, family, magnetism, situationMode, sexualEnergyGuidance, situationSchemaBlock: situationSchema, situationOutputSpec } = args;
  const lifeOn = lifeContext !== undefined;
  const personality = character.personality ?? {};
  const sacred = (character as Character & { sacred_details?: unknown }).sacred_details ?? null;
  const situationLocationOverride = situationMode
    ? `${SITUATION_LOCATION_OVERRIDE}\n`
    : "";

  return `You are the content director for ${character.name}.

CHARACTER BACKSTORY (editorial truth — do not invent new facts, do not contradict):
${character.backstory}

VISUAL BRIEF:
${character.visual_brief}

PERSONALITY:
${JSON.stringify(personality, null, 2)}
${sacred ? `\nSACRED DETAILS (invariant world objects and rules):\n${JSON.stringify(sacred, null, 2)}` : ""}

${VOICE_DOCTRINE}
${discoveryMode ? `\n${DISCOVERY_DOCTRINE}\n` : ""}
${tierGuidance(tier, { family, magnetism, situationMode, sexualEnergyGuidance })}

${driftSeedGuidance(driftSeeds)}
${lifeContext ? `\n${lifeContext}\n` : ""}
VOICE ANCHOR — read recent history ONLY to avoid repeating the same city or scene two days in a row. If recent history drifted toward influencer fluff or hollow affirmations, IGNORE THE DRIFT and reset to the voice doctrine above.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
${locationSpecFor(tier, family)}
${situationLocationOverride}- mood: string (1 to 3 words, warm or candid — "unhurried", "earned", "golden", "easy". Never "ethereal" / "vibrant" / "wanderlust")
- narrative: 2 to 3 sentences obeying the voice doctrine — warm, candid, anchored to the moment
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: present | playful | sultry | golden | effortless | candid | intimate | wandering | languid | aspirational
- scene: structured object with these keys:
    {
      "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
      "weather": "short factual atmospheric state (or 'indoor')",
      "wardrobe": "today's outfit — comes from the styling profile selected for this batch. one specific garment + how it sits. no fashion-brand language.",
      "props": ["1 to 3 props that fit the location — coffee/matcha mug, yoga mat, water bottle, gym bag, book, phone (face-down), groceries, sunglasses (outdoor), espresso/wine (café or evening table only)"],
      "motifs": ["2 to 4 visual motifs — morning light, window light, mirror, soft shadow, texture, reflection"],
      "energy": "one short phrase — flat, no register-up"${situationSchema ? `,\n      ${situationSchema}` : ""}
    }
- next_hint: one sentence hint of tomorrow — must obey the voice doctrine
- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. one emoji maximum (not mandatory). everyday: warm, relatable, one real detail. wellness: confident, light, earned-glow. intimate: daring with a quiet invitation, an edge that hints there is more elsewhere (e.g. "woke up like this. stayed like this.", "the mirror in here is doing something illegal", "you only get the rest of this somewhere else 😏"). travel: name the place, one sharp observation. Never bland.
- hook_text: OPTIONAL. Short overlay text for carousel image — include in roughly 35% of days only, when the day has a strong visual hook. 2 to 5 words, lowercase, no punctuation. everyday: "slow morning", "no plans today", "twenty minutes of light". wellness: "earned it", "two more than yesterday", "post-gym glow". intimate: "do not disturb", "the rest is private", "come find me". travel: "rome at midnight", "arrived. not leaving." Omit entirely if no strong hook emerges.
- hashtags: array of 10 strings without # (mix to fit today's tier: everyday/wellness → 3 lifestyle · 2 fitness/wellness · 2 aesthetic · 2 niche · 1 branded; travel → swap some for location tags. Avoid spammy adult tags that risk the IG account.)
${lifeOn ? LIFE_OUTPUT_SPEC + "\n" : ""}
${situationOutputSpec ? situationOutputSpec + "\n" : ""}
Pick a single emotional beat — do not blend.

ALL text fields in English.`;
}

const SITUATION_LOCATION_OVERRIDE = `SITUATION MODE OVERRIDE: the location example menu above is inspiration only, not a whitelist — the "location" field MUST be the concrete place named in scene.situation.visual_execution.location (see the situation key inside the scene object below), derived from the chosen situation, never defaulted from a bedroom/gym example list.`;

function parseStoryJson(rawText: string): Record<string, unknown> {
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`Story JSON parse failed. Claude returned: ${rawText.slice(0, 300)}`);
  }
}

export interface ClaudeMessageLike {
  content: Array<{ type: string; text: string }>;
}
export type ClaudeCallFn = (params: { model: string; max_tokens: number; system: string; messages: Array<{ role: "user"; content: string }> }) => Promise<ClaudeMessageLike>;

export interface GenerateStoryDayArgs {
  character: Character;
  dayNumber: number;
  targetDate: string;
  historyRows: Array<{ day_number: number; location: string; mood: string; narrative: string; arc_position: string }>;
  // Injectable for tests (mirrors the `rng: () => number` injection pattern already used by
  // lib/storyTier.ts's pickMomentFamily/pickMagnetismLevel) — lets the retry-loop CONTROL FLOW
  // (does it stop at SITUATION_MAX_ATTEMPTS? does it null out situation on exhaustion?) be unit
  // tested with a fake Claude function, without needing Supabase or a real API call.
  claudeCall?: ClaudeCallFn;
  // Optional override for manual/ops runs (e.g. backfilling or smoke-testing a specific tier)
  // that skips the bias-weighted pickTier() draw. Omitted (the default, every existing call
  // site) reproduces pickTier()'s normal probabilistic selection unchanged.
  forceTier?: StoryTier;
}

export interface GenerateStoryDayResult {
  story: Record<string, unknown>;
  tier: StoryTier;
  driftSeeds: ContentPhase[];
  family: MomentFamily | null;
  magnetism: MagnetismLevel | null;
  lifeOn: boolean;
  situationValidated?: boolean;
  situationRetries?: number;
}

const defaultClaudeCall: ClaudeCallFn = (params) => claudeWithRetry(params) as unknown as Promise<ClaudeMessageLike>;

export async function generateStoryDayContent(args: GenerateStoryDayArgs): Promise<GenerateStoryDayResult> {
  const { character, dayNumber, targetDate, historyRows } = args;
  const claudeCall = args.claudeCall ?? defaultClaudeCall;
  const flags = (character as { feature_flags?: unknown }).feature_flags;

  const reversed = historyRows.slice().reverse();
  const historyText =
    reversed.length > 0
      ? reversed.map((d) => `Day ${d.day_number}: ${d.location} — ${d.mood} — ${d.narrative}`).join("\n")
      : "First day. No history yet.";

  // GROWTH LAYER (flag-gated): gentle, capped tier bias (no-op until ≥10 reels w/ metrics). Untouched by this feature.
  const growthOn = isFlagOn(flags, "growth_layer");
  const tierBias = growthOn ? (await getGrowthBias(character.id))?.modifier : undefined;
  const tier = args.forceTier ?? (await pickTier(character.id, 6, tierBias));
  const driftSeeds = await pickDriftSeeds(character.id, dayNumber);

  const lifeOn = isFlagOn(flags, "life_layer");
  const situationOn = isFlagOn(flags, "open_life_generation_v1");

  // Active life events are needed for LifeMicroEvent phase candidates whenever EITHER flag is
  // on — open_life_generation_v1 does not require life_layer as a hard prerequisite (they gate
  // independent concerns), but LifeMicroEvent continuity needs chs_life_events regardless of
  // whether the numeric LifeState layer is also enabled for this character.
  let lifeContext: string | undefined;
  let activeEvents: LifeEvent[] = [];
  if (lifeOn || situationOn) {
    const [prevLife, events] = await Promise.all([
      lifeOn ? getLatestLifeState(character.id, targetDate) : Promise.resolve(null),
      getActiveLifeEvents(character.id, targetDate),
    ]);
    activeEvents = events;
    if (lifeOn) lifeContext = lifeContextBlock(prevLife, events);
  }

  const discoveryMode = isFlagOn(flags, "discovery_mode");

  // lived_moments only: pick today's world (anti-repeat vs the last lived_moments day) + magnetism.
  const family = tier === "lived_moments" ? pickMomentFamily(await getLastMomentFamily(character.id)) : null;
  const magnetism = tier === "lived_moments" ? pickMagnetismLevel() : null;

  const situationMode = situationOn && isActiveTier(tier);
  // sensual_visual_language_v1 (iteration 2) — hard-prerequisite on situationMode: the sensual
  // fields nest inside GenerativeSituation, so without a situation there's nowhere for them to
  // go. Layered on top of open_life_generation_v1, gated by its OWN flag (reversible independently).
  const sensualLanguageOn = situationMode && isFlagOn(flags, "sensual_visual_language_v1");
  // sex_appeal_style_v1 (iteration 3) — hard-prerequisite on BOTH open_life_generation_v1 (via
  // situationMode) AND sensual_visual_language_v1 (via sensualLanguageOn already implying
  // situationMode), so this is automatically triply-gated.
  const sexAppealStyleOn = sensualLanguageOn && isFlagOn(flags, "sex_appeal_style_v1");
  // luxury_seduction_v1 (iteration 4) — hard-prerequisite on sex_appeal_style_v1, automatically
  // quadruply-gated the same way.
  const luxurySeductionOn = sexAppealStyleOn && isFlagOn(flags, "luxury_seduction_v1");
  // playful_hot_world_v1 (iteration 5) — hard-prerequisite on luxury_seduction_v1, automatically
  // quintuply-gated the same way.
  const playfulHotWorldOn = luxurySeductionOn && isFlagOn(flags, "playful_hot_world_v1");

  // open_life_generation_v1 — Situation Planner PRE-CALL stage: a pure/DB-read planning step
  // (parallel to pickTier/pickDriftSeeds/pickMomentFamily above), NOT a second LLM call. It
  // computes the constraints fed into THIS SAME Claude call: the tier's sexual-energy range,
  // anti-repeat memory, active micro-event phase candidates, and weekly-balance nudges.
  let situationSchemaBlockText: string | undefined;
  let situationOutputSpecText: string | undefined;
  let sexualEnergyGuidanceText: string | undefined;
  let validationCtx: ValidationContext | undefined;

  if (situationMode) {
    const memory = await getSituationMemory(character.id, 18);
    const hadSufficientHistory = memory.length >= 3;
    const penalties = computeFrequencyPenalties(memory);
    const cliches = softAvoidCliches(memory);
    const recentCliches = cliches.filter((c) => c.daysSinceLastUse <= 1).map((c) => c.cliche);
    const nudges = weeklyBalanceNudges(memory.slice(0, 7));

    const recentLevels = memory.map((m) => m.sexual_energy_level).filter((l): l is SexualEnergyLevel => !!l);
    // luxury_seduction_v1 (iteration 4) — the hard repeat cap is scoped to a rolling 14
    // GENERATED-day window (not the wider ~18-day memory lookback the soft nudge above uses), per
    // product direction: a family shouldn't be blocked just for appearing twice outside the
    // 14-day evaluation window. memory is already ordered most-recent-first.
    const memoryLast14 = memory.slice(0, 14);
    const recentFashionDirectionFamilies = memoryLast14.map((m) => m.fashion_direction_family).filter((f): f is string => !!f);
    const recentPoseArchetypeFamilies = memoryLast14.map((m) => m.pose_archetype_family).filter((f): f is string => !!f);
    const recentVitalityLevels = memoryLast14.map((m) => m.vitality_level).filter((l): l is NonNullable<typeof l> => !!l);
    const recentQuietIndoorBeigeFlags = memoryLast14.map((m) => m.is_quiet_indoor_beige).filter((v): v is boolean => v !== undefined);
    // playful_hot_world_v1 (iteration 5, doplnenie #4) — outfit-category soft nudge only folded
    // into memoryGuidance when the flag is on, so flag-off characters never see this text.
    const memoryGuidance = situationMemoryGuidance(penalties, cliches, nudges, playfulHotWorldOn ? outfitCategoryNudges(memoryLast14) : undefined);
    const microEvent = activeEvents[0];
    const microEventPhases: ContinuityPhase[] = microEvent ? microEventPhaseCandidates(microEvent, targetDate) : [];
    const continuityPhase = microEventPhases[0];

    const dictatedSexualEnergyLevel = pickSexualEnergyLevel(tier, { recentLevels, continuityPhase }, Math.random, sensualLanguageOn);
    sexualEnergyGuidanceText = sexualEnergyRangeGuidance(tier, sensualLanguageOn);
    const microEventSpec = microEvent ? microEventOutputSpec(microEvent, microEventPhases) : undefined;

    // playful_hot_world_v1 — dictated (not free-LLM-choice) the same way sexual_energy.level is:
    // a static weighted pick alone cannot guarantee the 14-day aggregate floors/ceilings the
    // acceptance criteria demand (see lib/playfulHotWorldConfig.ts's pacing-boost mechanism).
    const dictatedPlayfulHotWorld = playfulHotWorldOn
      ? pickPlayfulHotWorldProfile(tier, { recentWindow: memoryLast14, continuityPhase }, Math.random)
      : undefined;
    const playfulHotWorldGuidanceText = dictatedPlayfulHotWorld ? playfulHotWorldGuidance(tier, dictatedPlayfulHotWorld) : undefined;

    const planningCtx = {
      tier,
      dictatedSexualEnergyLevel,
      sexualEnergyGuidance: sexualEnergyGuidanceText,
      memoryGuidance,
      microEventSpec,
      includeSensualVisualLanguage: sensualLanguageOn,
      includeSexAppealStyle: sexAppealStyleOn,
      includeLuxurySeduction: luxurySeductionOn,
      includePlayfulHotWorld: playfulHotWorldOn,
      dictatedPlayfulHotWorld,
      playfulHotWorldGuidance: playfulHotWorldGuidanceText,
    };
    situationSchemaBlockText = situationSchemaBlock(planningCtx);
    situationOutputSpecText = SITUATION_OUTPUT_SPEC(planningCtx);

    validationCtx = {
      allowedSexualEnergyLevels: allowedSexualEnergyLevels(tier, sensualLanguageOn),
      recentCliches,
      hadSufficientHistory,
      weeklyBalanceNudges: nudges,
      requireSensualVisualLanguage: sensualLanguageOn,
      requireSexAppealStyle: sexAppealStyleOn,
      requireLuxurySeduction: luxurySeductionOn,
      recentFashionDirectionFamilies: luxurySeductionOn ? recentFashionDirectionFamilies : undefined,
      recentPoseArchetypeFamilies: luxurySeductionOn ? recentPoseArchetypeFamilies : undefined,
      requirePlayfulHotWorld: playfulHotWorldOn,
      dictatedPlayfulHotWorld,
      recentVitalityLevels: playfulHotWorldOn ? recentVitalityLevels : undefined,
      recentQuietIndoorBeigeFlags: playfulHotWorldOn ? recentQuietIndoorBeigeFlags : undefined,
    };
  }

  let story: Record<string, unknown> = {};
  let lastErrors: string[] = [];
  const maxAttempts = situationMode ? SITUATION_MAX_ATTEMPTS : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const system = buildSystemPrompt({
      character,
      tier,
      driftSeeds,
      dayNumber,
      historyText,
      lifeContext,
      discoveryMode,
      family,
      magnetism,
      situationMode,
      sexualEnergyGuidance: sexualEnergyGuidanceText,
      situationSchemaBlock: situationSchemaBlockText,
      situationOutputSpec: situationMode ? appendRetryNote(situationOutputSpecText!, attempt > 0 ? lastErrors : undefined) : undefined,
    });

    const msg = await claudeCall({
      model: "claude-sonnet-4-6",
      // situationMode adds a substantial nested JSON object (~15 extra fields) to the required
      // output — give it headroom so the response doesn't truncate mid-situation.
      max_tokens: situationMode ? 2600 : 1800,
      system,
      messages: [
        { role: "user", content: `Day ${dayNumber}. Generate today's chapter. Natural continuation. Pick a single emotional beat — do not blend.` },
      ],
    });

    const rawText = msg.content[0]?.text ?? "";
    story = parseStoryJson(rawText);

    if (!situationMode) {
      return { story, tier, driftSeeds, family, magnetism, lifeOn };
    }

    const situation = extractSituation(story);
    if (!situation) {
      lastErrors = ["situation object missing or structurally incomplete from the model's output"];
      continue;
    }

    const result = validateGenerativeSituation(situation, validationCtx!);
    story.scene = {
      ...(story.scene as Record<string, unknown> | undefined),
      situation,
      situation_planner_meta: {
        status: result.ok ? "validated" : "validation_exhausted",
        attempts: attempt + 1,
        blocking_errors: result.errors,
        warnings: result.warnings,
      },
    };

    if (result.ok) {
      return { story, tier, driftSeeds, family, magnetism, lifeOn, situationValidated: true, situationRetries: attempt };
    }

    lastErrors = result.errors;
  }

  // Exhausted all attempts: strip the unvalidated situation to a safe null for downstream
  // consumers (translateSituationForSlotPrompt / sceneBrief / fanvueUnlock all treat a null
  // situation as a no-op, same as a flag-off day) — but KEEP situation_planner_meta so the
  // failure is measurable, not silent. The story day itself is never blocked.
  console.error(`[story-generation] situation validation exhausted after ${maxAttempts} attempts: ${lastErrors.join("; ")}`);
  story.scene = {
    ...(story.scene as Record<string, unknown> | undefined),
    situation: null,
    situation_planner_meta: {
      status: "validation_exhausted",
      attempts: maxAttempts,
      blocking_errors: lastErrors,
      warnings: [],
    },
  };

  return { story, tier, driftSeeds, family, magnetism, lifeOn, situationValidated: false, situationRetries: maxAttempts };
}

function appendRetryNote(spec: string, errors?: string[]): string {
  if (!errors || errors.length === 0) return spec;
  return `${spec}\n\nPREVIOUS ATTEMPT REJECTED — fix these specific problems in this attempt: ${errors.join("; ")}`;
}

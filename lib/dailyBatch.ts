import { supabase } from "@/lib/supabase";
import {
  DAILY_SLOTS,
  dailySlots,
  SlotSpec,
  pickArchetypesForBatch,
  logArchetypeUsage,
  getArchetypeGuidance,
} from "@/lib/archetypeDeck";
import { generateSceneBrief } from "@/lib/sceneBrief";
import { generateSlotPrompt, DoctrineKey } from "@/lib/slotPrompts";
import { generateCarouselScript, CarouselSlide } from "@/lib/carouselScript";
import { pickStylingProfile, StylingProfile } from "@/lib/stylingDeck";
import { isFlagOn } from "@/lib/featureFlags";
import type { LifeState } from "@/lib/lifeState";
import { maybeCreateFanvueUnlock } from "@/lib/fanvueUnlock";
import { pickReelFormat, ReelFormat } from "@/lib/reelFormats";
import { extractSituation, translateSituationForSlotPrompt, compactSituationTranslation, situationContextForSceneBrief, normalizeOutfitArchetypeFamily, normalizePoseArchetype, classifyOutfitCategory, GenerativeSituation } from "@/lib/situationPlanner";
import { getStrategyInputByProvenance } from "@/lib/creativeIntelligence/generationStrategyAdapter";
import { compilePromptDirector } from "@/lib/promptDirector";
import { writeSoul2Prompt } from "@/lib/promptDirector/promptWriter";
import type { PromptDirectorInput, PromptPackage } from "@/lib/promptDirector";

const ALLOWED_DOCTRINES: DoctrineKey[] = ["cinematic", "instagram", "editorial", "deepseek", "nano_banana", "caption"];

function resolveDoctrine(raw: unknown): DoctrineKey {
  const v = typeof raw === "string" ? raw.toLowerCase() : "";
  return (ALLOWED_DOCTRINES as string[]).includes(v) ? (v as DoctrineKey) : "cinematic";
}

// prompt_director_v1 — A/B seam (see lib/promptDirector/). OFF preserves the existing
// generateSlotPrompt() doctrine flow byte-for-byte; ON compiles the SAME SceneBrief/slot/archetype
// through the new compiler instead. Never changes story logic, SceneBrief content, styling or
// archetype selection — only how the final prompt string is worded for the target provider.
//
// Default target model per slot type: photo slots compile for "soul2" (Higgsfield Soul V2 is the
// identity-locked image path this app already prefers — see lib/higgsfieldSoul.ts), the video slot
// compiles for "kling" (the one video provider with a real, working end-to-end call in this repo —
// see lib/klingProvider.ts). This mapping is intentionally simple for v1; a future iteration can
// let the UI pick targetModel per slot (spec §24).
export function promptDirectorTargetForSlot(slot: SlotSpec): Pick<PromptDirectorInput, "outputType" | "generationMode" | "targetModel"> {
  if (slot.type === "video") {
    return { outputType: "video", generationMode: "image_to_video", targetModel: "kling" };
  }
  return { outputType: "image", generationMode: "text_to_image", targetModel: "soul2" };
}

interface SlotGenerationResult {
  prompt: string;
  visualSignature: { palette: string; lens: string; movement: string } | null;
  hookText: string | null;
  // Only set on the prompt_director_v1 path — full structured provenance persisted alongside the
  // compiled prompt (see mergeVisualSignature below).
  promptPackage?: PromptPackage;
}

// §21 — deterministic minimal plannedVideoIntent.action, derived from the REEL_VIDEO slot's own
// archetype (the "motion" family archetype picked for TODAY's batch — see lib/archetypeDeck.ts /
// chs_shot_archetypes), not invented. Each entry just restates that archetype's own seeded
// migration.sql description ("Sustained walking shot...", "Slow motion of a single gesture...",
// "Light shifting across subject... subject relatively still") as an imperative action sentence.
// No LLM call — this is a static lookup, same posture as OBSERVABLE_BEHAVIOR_MAP in
// performanceTransformer.ts. These are the only three "motion" family archetypes that exist today
// (verified against supabase/migration.sql); an archetype not in this table (future/unknown) simply
// gets no action, and firstFramePrepLines() already has a generic anatomically-sustainable fallback
// for exactly that case — never a hard requirement.
const REEL_ARCHETYPE_ACTION: Record<string, string> = {
  walking_motion: "she walks, continuing forward motion",
  gesture_motion: "she makes a single small, self-contained gesture — turning her head, raising a cup, adjusting a sleeve",
  light_motion: "light shifts across her — she stays relatively still while the environment moves",
};

// Exported so app/api/characters/prompt-director-preview/route.ts can compute the SAME default
// (single source of truth) when the caller hasn't supplied a manual override — see that route's
// own comment for how the override relationship works.
export function plannedActionForReelArchetype(archetypeId: string | undefined): string | undefined {
  return archetypeId ? REEL_ARCHETYPE_ACTION[archetypeId] : undefined;
}

async function generateSlotPromptViaDirector(args: {
  slot: SlotSpec;
  archetypeId: string;
  archetypeGuidance: string;
  sceneBriefJson: import("@/lib/sceneBrief").SceneBriefJson;
  character: { id: string; name: string; visual_brief: string; sacred_details: Record<string, unknown> | null; soul_id: string | null; feature_flags?: unknown };
  situationTranslation?: string;
  // Only meaningful for the reel_start_frame slot — the archetype id chosen for THIS batch's
  // reel_video sibling, so the start frame can be prepped for what actually happens next
  // (plannedActionForReelArchetype above). Unused for every other slot.
  reelVideoArchetypeId?: string;
  // F3 — today's tier + day number, threaded into the director for aesthetic direction and
  // deterministic photo-style rotation. Optional: absent reproduces pre-F3 output.
  tier?: string | null;
  dayNumber?: number | null;
}): Promise<SlotGenerationResult> {
  const target = promptDirectorTargetForSlot(args.slot);
  const luxuryWorldOn = isFlagOn(args.character.feature_flags, "luxury_world_v1");
  const promptWriterOn = isFlagOn(args.character.feature_flags, "prompt_writer_v1");
  const input: PromptDirectorInput = {
    character: {
      id: args.character.id,
      name: args.character.name,
      visualBrief: args.character.visual_brief,
      sacredDetails: args.character.sacred_details,
      soulId: args.character.soul_id,
    },
    sceneBrief: args.sceneBriefJson,
    slot: args.slot,
    archetypeId: args.archetypeId,
    archetypeGuidance: args.archetypeGuidance,
    situationTranslation: args.situationTranslation,
    luxuryWorldEnabled: luxuryWorldOn,
    tier: args.tier,
    dayNumber: args.dayNumber,
    // Every real photo generation in this app supplies SOME identity reference (Soul custom_reference_id,
    // Google's character sheet, BFL's reference images), and the video slot is always image-to-video
    // (fed the reel_start_frame) — text_to_video is not exercised by the daily batch today.
    hasReferenceImage: true,
    // §21 — "motion_only" stays the honest default MODE for reel_start_frame (the daily batch has
    // no user-configured speech), but the ACTION is now derived deterministically from the actual
    // reel_video archetype instead of being left blank — see REEL_ARCHETYPE_ACTION above. This is
    // what makes lib/promptDirector/imageSections.ts's firstFramePrepLines() give walking_motion
    // "leave room to move" guidance specifically, rather than only the generic fallback line.
    plannedVideoIntent:
      args.slot.slot === "reel_start_frame"
        ? { mode: "motion_only", action: plannedActionForReelArchetype(args.reelVideoArchetypeId) }
        : undefined,
    ...target,
  };
  const pkg = await compilePromptDirector(input);

  // F2 — prompt_writer_v1: an LLM pass rewrites the deterministic section output into one
  // continuous editorial brief. Image slots only; writeSoul2Prompt returns the deterministic
  // prompt as fallback on ANY failure (validation, meta-leakage, API error) — it never throws,
  // so a writer problem can never take down slot generation.
  if (promptWriterOn && input.outputType === "image") {
    const written = await writeSoul2Prompt(
      pkg.positivePrompt,
      args.sceneBriefJson.wardrobe_lock,
      args.sceneBriefJson.spatial_setup,
      pkg.positivePrompt
    );
    return { prompt: written, visualSignature: null, hookText: null, promptPackage: pkg };
  }

  return { prompt: pkg.positivePrompt, visualSignature: null, hookText: null, promptPackage: pkg };
}

export interface DailyBatchResult {
  batchId: string;
  status: "ready" | "partial_failed" | "failed";
  generated: Array<{ slot: string; archetype: string; ok: boolean; error?: string }>;
}

interface StartArgs {
  characterId: string;
  storyDayId: string;
  forceRegenerate?: boolean;
}

export async function generateDailyBatch({ characterId, storyDayId, forceRegenerate = false }: StartArgs): Promise<DailyBatchResult> {
  const { data: storyDay, error: storyErr } = await supabase
    .from("chs_story_days")
    .select("*")
    .eq("id", storyDayId)
    .single();
  if (storyErr || !storyDay) throw storyErr ?? new Error("Story day not found");

  const { data: character, error: charErr } = await supabase
    .from("chs_characters")
    .select("*")
    .eq("id", characterId)
    .single();
  if (charErr || !character) throw charErr ?? new Error("Character not found");

  const date = storyDay.date;

  const driftSeedsForDay = (storyDay.drift_seeds as Array<{ kind: string; detail?: string }>) ?? [];

  // open_life_generation_v1 — extracted once per batch (not per slot), from the same
  // chs_story_days.scene.situation the story-generation retry loop validated. A null/missing
  // situation (flag-off day, old row, or validation-exhausted day) is a safe no-op below.
  const situation: GenerativeSituation | null = extractSituation(storyDay);
  const situationTranslation = situation ? translateSituationForSlotPrompt(situation) : undefined;
  const compactSituationTranslationText = situation ? compactSituationTranslation(situation) : undefined;
  // sex_appeal_style_v1 (iteration 3, doplnenie #1) / luxury_seduction_v1 (iteration 4,
  // architektonické rozhodnutie #6) — normalized independently of the flags (pure function of
  // situation fields that are themselves undefined pre-iteration/flag-off, so this is a natural
  // no-op then). luxury_seduction.fashion_direction is the PRIMARY source when present; falls
  // back to sex_appeal_style.outfit_archetype otherwise. Used both to steer pickStylingProfile
  // below AND as a deliverables-comparison tag (declared archetype family vs. actually-selected
  // StylingProfile.id).
  const outfitFamilyHint =
    normalizeOutfitArchetypeFamily(situation?.luxury_seduction?.fashion_direction) ??
    normalizeOutfitArchetypeFamily(situation?.sex_appeal_style?.outfit_archetype);
  const poseFamilyHint = normalizePoseArchetype(situation?.luxury_seduction?.pose_archetype);
  const situationTags: SituationTags | undefined = situation
    ? {
        tier: storyDay.tier ?? null,
        life_domain: situation.life_domain ?? null,
        sexual_energy_level: situation.sexual_energy.level ?? null,
        sexual_expression_family: situation.sexual_energy.expression ?? null,
        magnetism_reason: situation.magnetism_reason ?? null,
        fanvue_tension_potential: situation.fanvue_tension.potential ?? null,
        visual_cliche: situation.sexual_cliches?.[0] ?? null,
        activity_family: situation.activity ?? null,
        location_family: situation.visual_execution.location ?? null,
        continuity_phase: situation.continuity_phase ?? null,
        outfit_archetype_family: outfitFamilyHint,
        styling_profile_id: null,
        fashion_direction_family: outfitFamilyHint,
        pose_archetype_family: poseFamilyHint,
        luxury_level: situation.luxury_seduction?.luxury_level ?? null,
        mood_temperature: situation.playful_hot_world?.mood_temperature ?? null,
        vitality_level: situation.playful_hot_world?.vitality_level ?? null,
        social_pulse: situation.playful_hot_world?.social_pulse ?? null,
        seasonality: situation.playful_hot_world?.seasonality ?? null,
        color_energy: situation.playful_hot_world?.color_energy ?? null,
        fun_factor: situation.playful_hot_world?.fun_factor ?? null,
        outfit_category: classifyOutfitCategory(outfitFamilyHint),
      }
    : undefined;

  const { data: existingPlan } = await supabase
    .from("chs_daily_plans")
    .select("*")
    .eq("character_id", characterId)
    .eq("date", date)
    .maybeSingle();

  let batchId: string;
  let sceneBriefJson: Record<string, unknown>;
  let sceneBriefDoctrine: string;
  // sex_appeal_style_v1 (iteration 3, doplnenie #1/#5) — defaults to the reused plan's stored id
  // when one exists (planComplete path never re-picks a profile); overwritten below once a fresh
  // pick runs. Feeds situationTags.styling_profile_id for the deliverables comparison table.
  let resolvedStylingProfileId: string | null = (existingPlan as { styling_profile?: string } | null)?.styling_profile ?? null;

  const planComplete =
    existingPlan &&
    existingPlan.scene_brief &&
    existingPlan.scene_brief_doctrine &&
    !forceRegenerate;

  if (planComplete) {
    batchId = existingPlan.id;
    sceneBriefJson = existingPlan.scene_brief;
    sceneBriefDoctrine = existingPlan.scene_brief_doctrine;
  } else {
    const { data: recentPlanRows } = await supabase
      .from("chs_daily_plans")
      .select("scene_brief")
      .eq("character_id", characterId)
      .not("scene_brief", "is", null)
      .order("created_at", { ascending: false })
      .limit(7);

    const recentBriefs = ((recentPlanRows ?? []) as Array<{ scene_brief: import("@/lib/sceneBrief").SceneBriefJson | null }>)
      .map((r) => r.scene_brief)
      .filter((b): b is import("@/lib/sceneBrief").SceneBriefJson => !!b && typeof b.wardrobe_lock === "string")
      .map((b) => ({ wardrobe_lock: b.wardrobe_lock, allowed_props: b.allowed_props ?? [] }));

    // sensual_visual_language_v1 (iteration 2) — biases the magnetic wardrobe pool + soft
    // time/weather compatibility filter (see lib/stylingDeck.ts's selectStylingSourcePool) and
    // requires the concrete sensual_visual_language fields in validation. Hard-prerequisite on
    // open_life_generation_v1 in spirit (situation must exist for there to be anything to bias by).
    const sensualLanguageOn = isFlagOn(character.feature_flags, "sensual_visual_language_v1");
    // sex_appeal_style_v1 (iteration 3) — hard-prerequisite on sensualLanguageOn, same triple-gate
    // pattern as lib/storyGeneration.ts's sexAppealStyleOn.
    const sexAppealStyleOn = sensualLanguageOn && isFlagOn(character.feature_flags, "sex_appeal_style_v1");
    // luxury_seduction_v1 (iteration 4) — hard-prerequisite on sexAppealStyleOn, same
    // quadruple-gate pattern as lib/storyGeneration.ts's luxurySeductionOn.
    const luxurySeductionOn = sexAppealStyleOn && isFlagOn(character.feature_flags, "luxury_seduction_v1");

    // Pick styling profile for today (or reuse from existing plan)
    let stylingProfile: StylingProfile | undefined;
    if (planComplete && (existingPlan as { styling_profile?: string }).styling_profile) {
      const existingId = (existingPlan as { styling_profile: string }).styling_profile;
      const { STYLING_PROFILES, MAGNETIC_STYLING_PROFILES, SEX_APPEAL_STYLING_PROFILES, LUXURY_SEDUCTION_STYLING_PROFILES } = await import("@/lib/stylingDeck");
      stylingProfile =
        STYLING_PROFILES.find((p) => p.id === existingId) ??
        MAGNETIC_STYLING_PROFILES.find((p) => p.id === existingId) ??
        SEX_APPEAL_STYLING_PROFILES.find((p) => p.id === existingId) ??
        LUXURY_SEDUCTION_STYLING_PROFILES.find((p) => p.id === existingId);
    }
    if (!stylingProfile) {
      stylingProfile = await pickStylingProfile(
        characterId,
        storyDay.tier ?? "lifestyle_travel",
        storyDay.moment_family ?? null,
        sensualLanguageOn,
        situation ? { timeOfDay: situation.visual_execution.time_of_day, weather: situation.visual_execution.weather } : undefined,
        sexAppealStyleOn,
        sexAppealStyleOn ? outfitFamilyHint : undefined,
        luxurySeductionOn
      );
      // Persist after scene brief is saved (update below)
    }
    resolvedStylingProfileId = stylingProfile.id;

    // LIFE LAYER (flag-gated): a short continuity note from today's persisted life_state.
    let lifeNote: string | undefined;
    if (isFlagOn(character.feature_flags, "life_layer") && storyDay.life_state) {
      const ls = storyDay.life_state as LifeState;
      lifeNote = [
        ls.mood_state ? `mood ${ls.mood_state}` : null,
        ls.energy_level != null ? `energy ${ls.energy_level}/10` : null,
        ls.recent_event ? `recently: ${ls.recent_event}` : null,
      ].filter(Boolean).join(", ") || undefined;
    }

    // open_life_generation_v1 — sibling to lifeNote, never a replacement for it. Lets the scene
    // brief's spatial_setup/wardrobe_lock reflect today's situation without touching SACRED
    // DETAILS or the environment doctrine (see lib/sceneBrief.ts's situationContext handling).
    // luxury_seduction_v1 (iteration 4, doplnenie #12) — situationContextForSceneBrief also
    // appends social_status_signal (with an explicit "must be visually grounded" instruction)
    // when present, giving it a chance to actually reach spatial_setup/allowed_props.
    const situationContext = situation ? situationContextForSceneBrief(situation) : undefined;

    const brief = await generateSceneBrief({
      storyScene: {
        location: storyDay.location,
        mood: storyDay.mood,
        narrative: storyDay.narrative,
        arc_position: storyDay.arc_position,
        emotional_beat: storyDay.emotional_beat ?? null,
        scene: storyDay.scene ?? null,
        tier: storyDay.tier ?? null,
        drift_seeds: driftSeedsForDay,
      },
      character: {
        name: character.name,
        visual_brief: character.visual_brief,
        sacred_details: (character.sacred_details as Record<string, unknown>) ?? null,
        visual_tone: character.visual_tone ?? null,
        styling_note: character.styling_note ?? null,
      },
      recentBriefs,
      stylingProfile,
      lifeNote,
      situationContext,
      activityContext: sensualLanguageOn && situation ? { activity: situation.activity, continuityPhase: situation.continuity_phase } : undefined,
      luxuryWorld: isFlagOn(character.feature_flags, "luxury_world_v1"),
    });

    sceneBriefJson = brief.json as unknown as Record<string, unknown>;
    sceneBriefDoctrine = brief.doctrine;

    if (existingPlan) {
      const { error: updErr } = await supabase
        .from("chs_daily_plans")
        .update({
          story_day_id: storyDayId,
          scene_brief: sceneBriefJson,
          scene_brief_doctrine: sceneBriefDoctrine,
          batch_status: "generating",
          styling_profile: stylingProfile?.id ?? null,
        })
        .eq("id", existingPlan.id);
      if (updErr) throw updErr;
      batchId = existingPlan.id;
    } else {
      const { data: newPlan, error: insErr } = await supabase
        .from("chs_daily_plans")
        .insert({
          character_id: characterId,
          date,
          story_day_id: storyDayId,
          scene_brief: sceneBriefJson,
          scene_brief_doctrine: sceneBriefDoctrine,
          batch_status: "generating",
          styling_profile: stylingProfile?.id ?? null,
        })
        .select()
        .single();
      if (insErr || !newPlan) throw insErr ?? new Error("Plan insert failed");
      batchId = newPlan.id;
    }
  }

  if (situationTags) situationTags.styling_profile_id = resolvedStylingProfileId;

  const discoveryMode = isFlagOn(character.feature_flags, "discovery_mode");
  // Rotate a proven reel format per day (stable seed = day_number) in discovery mode.
  const reelFormat = discoveryMode ? pickReelFormat(Number(storyDay.day_number) || 0) : undefined;
  const slotsToGenerate = await determineSlotsNeeded(batchId, forceRegenerate, discoveryMode, reelFormat, storyDay.tier ?? undefined);

  if (slotsToGenerate.length === 0) {
    await supabase
      .from("chs_daily_plans")
      .update({ batch_status: "ready" })
      .eq("id", batchId);
    return { batchId, status: "ready", generated: [] };
  }

  // Coordinated carousel script — only when the batch actually has feed slots.
  // Discovery mode is reel-only (no carousel), so skip the script (and its Claude
  // call) entirely there. Falls back to per-slot hooks on failure.
  const carouselSlideMap: Record<string, CarouselSlide> = {};
  const hasFeedSlots = slotsToGenerate.some((s) => s.channel === "feed");
  if (hasFeedSlots) {
    try {
      const existingScript = planComplete
        ? (existingPlan as { carousel_script?: unknown }).carousel_script
        : null;
      const script = existingScript
        ? (existingScript as import("@/lib/carouselScript").CarouselScript)
        : await generateCarouselScript({
            tier: storyDay.tier ?? "lifestyle_travel",
            location: storyDay.location,
            mood: storyDay.mood,
            narrative: storyDay.narrative,
            emotional_beat: storyDay.emotional_beat ?? null,
            character: { name: character.name, visual_brief: character.visual_brief },
            slideCount: 5,
          });
      if (!existingScript) {
        await supabase
          .from("chs_daily_plans")
          .update({ carousel_script: script })
          .eq("id", batchId);
      }
      for (const slide of script.slides) {
        carouselSlideMap[`carousel_${slide.slide}`] = slide;
      }
    } catch (err) {
      console.error("[carousel-script]", err);
      // Non-fatal: slots fall back to per-slot hook generation
    }
  }

  // creative_intelligence_generation_v1 — NEVER re-selects a recommendation (see
  // generationStrategyAdapter.ts's file header for the single-selection invariant). Purely
  // reads back the exact recommendation storyGeneration.ts already picked and persisted onto
  // this story_day, keyed by (strategy_snapshot_id, recommendation_rank). Null when the flag was
  // off, CI was unavailable that day, or the snapshot has since been deleted — pickArchetypesForBatch
  // then runs exactly as it does today.
  const ciStrategyInput = storyDay.strategy_snapshot_id
    ? await getStrategyInputByProvenance(storyDay.strategy_snapshot_id as string, storyDay.recommendation_rank as number)
    : null;

  const archetypeMap = await pickArchetypesForBatch({
    characterId,
    slots: slotsToGenerate,
    preferredShotStyle: ciStrategyInput?.preferredShotStyle,
  });

  await prereserveSlots(batchId, storyDayId, slotsToGenerate, archetypeMap);

  const guidanceCache = new Map<string, string>();
  for (const slot of slotsToGenerate) {
    const archId = archetypeMap[slot.slot];
    if (!guidanceCache.has(archId)) {
      guidanceCache.set(archId, await getArchetypeGuidance(archId));
    }
  }

  const wave1 = slotsToGenerate.slice(0, 3);
  const wave2 = slotsToGenerate.slice(3, 6);
  const wave3 = slotsToGenerate.slice(6);

  const generated: DailyBatchResult["generated"] = [];

  const doctrine = resolveDoctrine(character.prompt_doctrine);
  const promptDirectorOn = isFlagOn(character.feature_flags, "prompt_director_v1");

  const characterForGen = character;

  for (const wave of [wave1, wave2, wave3]) {
    if (wave.length === 0) continue;
    const settled = await Promise.allSettled(
      wave.map((slot) =>
        runSlot({
          slot,
          archetypeId: archetypeMap[slot.slot],
          archetypeGuidance: guidanceCache.get(archetypeMap[slot.slot]) ?? "",
          sceneBriefJson: sceneBriefJson as never,
          sceneBriefDoctrine,
          character: characterForGen,
          arcPosition: storyDay.arc_position,
          batchId,
          storyDayId,
          characterId,
          doctrine,
          carouselSlide: carouselSlideMap[slot.slot],
          situationTranslation,
          compactSituationTranslation: compactSituationTranslationText,
          situationTags,
          promptDirectorOn,
          reelVideoArchetypeId: archetypeMap["reel_video"],
          tier: storyDay.tier ?? null,
          dayNumber: Number(storyDay.day_number) || null,
        })
      )
    );

    settled.forEach((res, i) => {
      const slot = wave[i];
      const archId = archetypeMap[slot.slot];
      if (res.status === "fulfilled") {
        generated.push({ slot: slot.slot, archetype: archId, ok: true });
      } else {
        generated.push({
          slot: slot.slot,
          archetype: archId,
          ok: false,
          error: String(res.reason),
        });
      }
    });
  }

  const failedSlots = generated.filter((g) => !g.ok);

  if (failedSlots.length > 0) {
    const retrySettled = await Promise.allSettled(
      failedSlots.map((f) => {
        const slot = slotsToGenerate.find((s) => s.slot === f.slot)!;
        return runSlot({
          slot,
          archetypeId: archetypeMap[slot.slot],
          archetypeGuidance: guidanceCache.get(archetypeMap[slot.slot]) ?? "",
          sceneBriefJson: sceneBriefJson as never,
          sceneBriefDoctrine,
          character: characterForGen,
          arcPosition: storyDay.arc_position,
          batchId,
          storyDayId,
          characterId,
          doctrine,
          carouselSlide: carouselSlideMap[slot.slot],
          isRetry: true,
          situationTranslation,
          compactSituationTranslation: compactSituationTranslationText,
          situationTags,
          promptDirectorOn,
          reelVideoArchetypeId: archetypeMap["reel_video"],
          tier: storyDay.tier ?? null,
          dayNumber: Number(storyDay.day_number) || null,
        });
      })
    );

    retrySettled.forEach((res, i) => {
      const target = failedSlots[i];
      const idx = generated.findIndex((g) => g.slot === target.slot);
      if (res.status === "fulfilled") {
        generated[idx] = { slot: target.slot, archetype: target.archetype, ok: true };
      }
    });
  }

  const stillFailed = generated.filter((g) => !g.ok).length;
  const status: DailyBatchResult["status"] =
    stillFailed === 0 ? "ready" :
    stillFailed === generated.length ? "failed" :
    "partial_failed";

  await supabase
    .from("chs_daily_plans")
    .update({ batch_status: status })
    .eq("id", batchId);

  // FANVUE LAYER (flag-gated): post-batch, create a monetization DRAFT from today's scene.
  // Pure DB write — never publishes, never calls the Fanvue MCP. Non-fatal.
  if (status === "ready" && isFlagOn(character.feature_flags, "fanvue_drafts")) {
    try {
      await maybeCreateFanvueUnlock({
        characterId,
        storyDayId,
        dailyPlanId: batchId,
        storyDay: {
          tier: storyDay.tier ?? null,
          moment_family: storyDay.moment_family ?? null,
          magnetism_level: storyDay.magnetism_level ?? null,
          location: storyDay.location ?? null,
          mood: storyDay.mood ?? null,
          ig_caption: storyDay.ig_caption ?? null,
          hook_text: storyDay.hook_text ?? null,
        },
        sceneBriefJson: sceneBriefJson ?? null,
        situationFanvueTension: situation?.fanvue_tension,
        sensualVisualLanguage: situation?.sensual_visual_language,
        sexAppealStyle: situation?.sex_appeal_style,
        luxurySeduction: situation?.luxury_seduction,
        playfulHotWorld: situation?.playful_hot_world,
        pipelineV1: isFlagOn(character.feature_flags, "fanvue_paid_continuation_v1"),
        // validateFanvueSource() inputs (item 0) — a non-null situation always passed the
        // story-generation retry loop's validation by construction (situation is only ever null
        // for a flag-off/old row, or when SITUATION_MAX_ATTEMPTS was exhausted — both cases the
        // gate must treat as unvalidated), so situationValidated collapses to situation !== null.
        situation,
        situationValidated: situation !== null,
      });
    } catch (err) {
      console.error("[fanvue-unlock]", err);
    }
  }

  return { batchId, status, generated };
}

async function determineSlotsNeeded(batchId: string, force: boolean, discoveryMode = false, reelFormat?: ReelFormat, tier?: string): Promise<SlotSpec[]> {
  const deck = dailySlots(discoveryMode, reelFormat, tier);
  if (force) {
    await supabase.from("chs_media").delete().eq("batch_id", batchId);
    return deck;
  }

  const { data: existing } = await supabase
    .from("chs_media")
    .select("slot, generation_status")
    .eq("batch_id", batchId);

  const completedSlots = new Set(
    (existing ?? []).filter((m) => m.generation_status === "completed").map((m) => m.slot)
  );

  return deck.filter((s) => !completedSlots.has(s.slot));
}

async function prereserveSlots(
  batchId: string,
  storyDayId: string,
  slots: SlotSpec[],
  archetypeMap: Record<string, string>
): Promise<void> {
  const { data: existing } = await supabase
    .from("chs_media")
    .select("id, slot")
    .eq("batch_id", batchId)
    .in("slot", slots.map((s) => s.slot));

  const existingSlotSet = new Set((existing ?? []).map((e) => e.slot));
  const toInsert = slots
    .filter((s) => !existingSlotSet.has(s.slot))
    .map((s) => ({
      batch_id: batchId,
      story_day_id: storyDayId,
      type: s.type,
      channel: s.channel,
      slot: s.slot,
      shot_archetype: archetypeMap[s.slot],
      sequence_index: s.sequence_index,
      generation_status: "pending" as const,
      status: "pending" as const,
      higgsfield_prompt: "",
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from("chs_media").insert(toInsert);
    if (error) throw error;
  }
}

// open_life_generation_v1 — additive performance-logging tags merged into chs_media.visual_signature.
// Never consumed by lib/growthScore.ts's getGrowthBias() or any auto-weighting logic (spec §15/§non-goals).
interface SituationTags {
  tier: string | null;
  life_domain: string | null;
  sexual_energy_level: string | null;
  sexual_expression_family: string | null;
  magnetism_reason: string | null;
  fanvue_tension_potential: string | null;
  visual_cliche: string | null;
  activity_family: string | null;
  location_family: string | null;
  continuity_phase: string | null;
  // sex_appeal_style_v1 (iteration 3, doplnenie #1/#5) — declared outfit family (normalized from
  // situation.sex_appeal_style.outfit_archetype) vs. the StylingProfile.id actually selected by
  // pickStylingProfile, for the deliverables comparison table.
  outfit_archetype_family: string | null;
  styling_profile_id: string | null;
  // luxury_seduction_v1 (iteration 4) — same declared-vs-selected comparison, one layer deeper.
  // fashion_direction_family mirrors outfit_archetype_family's value (luxury.fashion_direction
  // takes precedence when present, falling back to sex_appeal_style.outfit_archetype).
  fashion_direction_family: string | null;
  pose_archetype_family: string | null;
  luxury_level: string | null;
  // playful_hot_world_v1 (iteration 5) — performance-logging only, never consumed by
  // getGrowthBias/auto-weighting, same posture as every other situation_tags field.
  mood_temperature: string | null;
  vitality_level: string | null;
  social_pulse: string | null;
  seasonality: string | null;
  color_energy: string | null;
  fun_factor: string | null;
  outfit_category: string | null;
}

// prompt_director_v1 provenance (spec §25) is stored additively under visual_signature.prompt_director
// — same pattern as situation_tags below, no migration needed (chs_media.visual_signature is
// already a generic jsonb column).
function mergeVisualSignature(
  base: { palette: string; lens: string; movement: string } | null,
  situationTags?: SituationTags,
  promptDirector?: PromptPackage
): (Record<string, unknown>) | null {
  if (!situationTags && !promptDirector) return base;
  return {
    ...(base ?? {}),
    ...(situationTags ? { situation_tags: situationTags } : {}),
    ...(promptDirector ? { prompt_director: promptDirector } : {}),
  };
}

interface RunSlotArgs {
  slot: SlotSpec;
  archetypeId: string;
  archetypeGuidance: string;
  sceneBriefJson: import("@/lib/sceneBrief").SceneBriefJson;
  sceneBriefDoctrine: string;
  character: {
    id: string;
    name: string;
    visual_brief: string;
    sacred_details: Record<string, unknown> | null;
    soul_id: string | null;
    feature_flags?: unknown;
  };
  arcPosition: string;
  batchId: string;
  storyDayId: string;
  characterId: string;
  doctrine: DoctrineKey;
  carouselSlide?: CarouselSlide;
  isRetry?: boolean;
  // open_life_generation_v1 — precomputed once per batch, threaded to every slot.
  situationTranslation?: string;
  compactSituationTranslation?: string;
  situationTags?: SituationTags;
  // prompt_director_v1 (see lib/promptDirector/) — resolved ONCE per batch from
  // character.feature_flags, threaded to every slot exactly like `doctrine` above. false/undefined
  // reproduces today's generateSlotPrompt() flow byte-for-byte.
  promptDirectorOn?: boolean;
  // §21 — this batch's reel_video archetype id, threaded to every slot (only actually consumed
  // when compiling reel_start_frame) so plannedActionForReelArchetype() can derive a deterministic
  // plannedVideoIntent.action without a second lookup inside runSlot() itself.
  reelVideoArchetypeId?: string;
  // F3 — today's tier + day number for the director's aesthetic direction / photo-style seed.
  tier?: string | null;
  dayNumber?: number | null;
}

async function runSlot(args: RunSlotArgs): Promise<void> {
  await supabase
    .from("chs_media")
    .update({
      generation_status: args.isRetry ? "retrying" : "generating",
      ...(args.isRetry ? { retry_count: 1 } : {}),
    })
    .eq("batch_id", args.batchId)
    .eq("slot", args.slot.slot);

  try {
    const result: SlotGenerationResult = args.promptDirectorOn
      ? await generateSlotPromptViaDirector({
          slot: args.slot,
          archetypeId: args.archetypeId,
          archetypeGuidance: args.archetypeGuidance,
          sceneBriefJson: args.sceneBriefJson,
          character: args.character,
          situationTranslation: args.situationTranslation,
          reelVideoArchetypeId: args.reelVideoArchetypeId,
          tier: args.tier,
          dayNumber: args.dayNumber,
        })
      : await generateSlotPrompt({
          doctrine: args.doctrine,
          slot: args.slot,
          archetypeId: args.archetypeId,
          archetypeGuidance: args.archetypeGuidance,
          sceneBriefJson: args.sceneBriefJson,
          sceneBriefDoctrine: args.sceneBriefDoctrine,
          character: args.character,
          arcPosition: args.arcPosition,
          carouselSlide: args.carouselSlide,
          situationTranslation: args.situationTranslation,
          compactSituationTranslation: args.compactSituationTranslation,
        });

    const { error: updErr } = await supabase
      .from("chs_media")
      .update({
        higgsfield_prompt: result.prompt,
        visual_signature: mergeVisualSignature(result.visualSignature, args.situationTags, result.promptPackage),
        hook_text: result.hookText ?? null,
        generation_status: "completed",
        last_error: null,
        prompt_doctrine: args.doctrine,
      })
      .eq("batch_id", args.batchId)
      .eq("slot", args.slot.slot);

    if (updErr) throw updErr;

    await logArchetypeUsage({
      characterId: args.characterId,
      archetypeId: args.archetypeId,
      channel: args.slot.channel,
      batchId: args.batchId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("chs_media")
      .update({
        generation_status: "failed",
        last_error: message.slice(0, 1000),
      })
      .eq("batch_id", args.batchId)
      .eq("slot", args.slot.slot);
    throw err;
  }
}

export async function reconcileFailedSlots(maxRetries = 3): Promise<{ retried: number; succeeded: number }> {
  const { data: failed } = await supabase
    .from("chs_media")
    .select(`
      id, slot, batch_id, retry_count, shot_archetype,
      chs_daily_plans!inner(id, character_id, story_day_id, scene_brief, scene_brief_doctrine)
    `)
    .eq("generation_status", "failed")
    .lt("retry_count", maxRetries);

  if (!failed || failed.length === 0) {
    return { retried: 0, succeeded: 0 };
  }

  let succeeded = 0;

  for (const row of failed as unknown as Array<{
    id: string;
    slot: string;
    batch_id: string;
    retry_count: number;
    shot_archetype: string;
    chs_daily_plans: {
      id: string;
      character_id: string;
      story_day_id: string;
      scene_brief: import("@/lib/sceneBrief").SceneBriefJson;
      scene_brief_doctrine: string;
    };
  }>) {
    // Existence check on slot name (identical across decks); real spec resolved below with char's flags.
    if (!DAILY_SLOTS.some((s) => s.slot === row.slot)) continue;

    const { data: char } = await supabase
      .from("chs_characters")
      .select("*")
      .eq("id", row.chs_daily_plans.character_id)
      .single();

    const { data: storyDay } = await supabase
      .from("chs_story_days")
      .select("arc_position, drift_seeds, day_number, tier")
      .eq("id", row.chs_daily_plans.story_day_id)
      .single();

    if (!char || !storyDay) continue;

    // Resolve the slot spec with the same discovery deck + reel format the initial
    // generation used, so a retried reel keeps its format.
    const rcDiscovery = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "discovery_mode");
    const rcFormat = rcDiscovery ? pickReelFormat(Number((storyDay as { day_number?: number }).day_number) || 0) : undefined;
    const slot = dailySlots(rcDiscovery, rcFormat, (storyDay as { tier?: string }).tier).find((s) => s.slot === row.slot)!;

    const guidance = await getArchetypeGuidance(row.shot_archetype);
    const doctrine = resolveDoctrine((char as { prompt_doctrine?: unknown }).prompt_doctrine);
    const rcPromptDirectorOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "prompt_director_v1");

    // §21 — a retried reel_start_frame needs its sibling reel_video's archetype too (see
    // REEL_ARCHETYPE_ACTION above); the batch-level archetypeMap generateDailyBatch() has isn't in
    // scope here, so look the one row up directly. Only fires for this one slot/flag combination.
    let rcReelVideoArchetypeId: string | undefined;
    if (rcPromptDirectorOn && row.slot === "reel_start_frame") {
      const { data: reelVideoRow } = await supabase
        .from("chs_media")
        .select("shot_archetype")
        .eq("batch_id", row.batch_id)
        .eq("slot", "reel_video")
        .maybeSingle();
      rcReelVideoArchetypeId = reelVideoRow?.shot_archetype ?? undefined;
    }

    try {
      await supabase
        .from("chs_media")
        .update({
          generation_status: "retrying",
          retry_count: row.retry_count + 1,
        })
        .eq("id", row.id);

      const result: SlotGenerationResult = rcPromptDirectorOn
        ? await generateSlotPromptViaDirector({
            slot,
            archetypeId: row.shot_archetype,
            archetypeGuidance: guidance,
            sceneBriefJson: row.chs_daily_plans.scene_brief,
            character: char,
            reelVideoArchetypeId: rcReelVideoArchetypeId,
            tier: (storyDay as { tier?: string | null }).tier ?? null,
            dayNumber: Number((storyDay as { day_number?: number }).day_number) || null,
          })
        : await generateSlotPrompt({
            doctrine,
            slot,
            archetypeId: row.shot_archetype,
            archetypeGuidance: guidance,
            sceneBriefJson: row.chs_daily_plans.scene_brief,
            sceneBriefDoctrine: row.chs_daily_plans.scene_brief_doctrine,
            character: char,
            arcPosition: storyDay.arc_position,
          });

      await supabase
        .from("chs_media")
        .update({
          higgsfield_prompt: result.prompt,
          visual_signature: mergeVisualSignature(result.visualSignature, undefined, result.promptPackage),
          hook_text: result.hookText ?? null,
          generation_status: "completed",
          last_error: null,
          prompt_doctrine: doctrine,
        })
        .eq("id", row.id);

      await logArchetypeUsage({
        characterId: row.chs_daily_plans.character_id,
        archetypeId: row.shot_archetype,
        channel: slot.channel,
        batchId: row.batch_id,
      });

      succeeded++;
    } catch (err) {
      await supabase
        .from("chs_media")
        .update({
          generation_status: "failed",
          last_error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        })
        .eq("id", row.id);
    }
  }

  const batchIds = Array.from(new Set((failed ?? []).map((f: { batch_id: string }) => f.batch_id)));
  for (const batchId of batchIds) {
    const { data: all } = await supabase
      .from("chs_media")
      .select("generation_status")
      .eq("batch_id", batchId);
    if (!all) continue;
    const allCompleted = all.every((m) => m.generation_status === "completed");
    const anyCompleted = all.some((m) => m.generation_status === "completed");
    const status = allCompleted ? "ready" : anyCompleted ? "partial_failed" : "failed";
    await supabase.from("chs_daily_plans").update({ batch_status: status }).eq("id", batchId);
  }

  return { retried: failed.length, succeeded };
}

import { supabase } from "@/lib/supabase";
import {
  DAILY_SLOTS,
  SlotSpec,
  pickArchetypesForBatch,
  logArchetypeUsage,
  getArchetypeGuidance,
} from "@/lib/archetypeDeck";
import { generateSceneBrief } from "@/lib/sceneBrief";
import { generateSlotPrompt, DoctrineKey } from "@/lib/slotPrompts";
import { generateCarouselScript, CarouselSlide } from "@/lib/carouselScript";

const ALLOWED_DOCTRINES: DoctrineKey[] = ["cinematic", "instagram", "editorial", "deepseek"];

function resolveDoctrine(raw: unknown): DoctrineKey {
  const v = typeof raw === "string" ? raw.toLowerCase() : "";
  return (ALLOWED_DOCTRINES as string[]).includes(v) ? (v as DoctrineKey) : "cinematic";
}

// Strip marseille_stranger from sacred_details unless the drift seed is active.
// Without this filter, Claude sees stranger data in sacred_details JSON and
// includes it in scene brief / slot prompts even when no drift seed says it
// should appear today. Conditional instructions ("ONLY if drift seed active")
// are unreliable — the only safe way is to remove the data.
function filterSacredForGeneration(
  sacred: Record<string, unknown> | null,
  includeStranger: boolean
): Record<string, unknown> | null {
  if (!sacred) return null;
  if (includeStranger) return sacred;
  const filtered = { ...sacred };
  delete filtered.marseille_stranger;
  return filtered;
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

  // Determine whether Marseille Stranger is active in today's batch.
  // If not, strip from sacred_details so Claude never sees the data.
  const driftSeedsForDay = (storyDay.drift_seeds as Array<{ kind: string; detail?: string }>) ?? [];
  const strangerActive = driftSeedsForDay.some((s) => s.kind === "recurring_stranger");
  const filteredSacred = filterSacredForGeneration(
    (character.sacred_details as Record<string, unknown>) ?? null,
    strangerActive
  );

  const { data: existingPlan } = await supabase
    .from("chs_daily_plans")
    .select("*")
    .eq("character_id", characterId)
    .eq("date", date)
    .maybeSingle();

  let batchId: string;
  let sceneBriefJson: Record<string, unknown>;
  let sceneBriefDoctrine: string;

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
        sacred_details: filteredSacred,
        visual_tone: character.visual_tone ?? null,
        styling_note: character.styling_note ?? null,
      },
      recentBriefs,
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
        })
        .select()
        .single();
      if (insErr || !newPlan) throw insErr ?? new Error("Plan insert failed");
      batchId = newPlan.id;
    }
  }

  const slotsToGenerate = await determineSlotsNeeded(batchId, forceRegenerate);

  if (slotsToGenerate.length === 0) {
    await supabase
      .from("chs_daily_plans")
      .update({ batch_status: "ready" })
      .eq("id", batchId);
    return { batchId, status: "ready", generated: [] };
  }

  // Generate carousel script (coordinated 5-slide arc). Falls back to per-slot hooks on failure.
  const carouselSlideMap: Record<string, CarouselSlide> = {};
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

  const archetypeMap = await pickArchetypesForBatch({
    characterId,
    slots: slotsToGenerate,
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

  // Inject filtered sacred_details into the character object passed to slot prompts,
  // so stranger data is only visible to Claude when the drift seed is actually active.
  const characterForGen = { ...character, sacred_details: filteredSacred };

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

  return { batchId, status, generated };
}

async function determineSlotsNeeded(batchId: string, force: boolean): Promise<SlotSpec[]> {
  if (force) {
    await supabase.from("chs_media").delete().eq("batch_id", batchId);
    return DAILY_SLOTS;
  }

  const { data: existing } = await supabase
    .from("chs_media")
    .select("slot, generation_status")
    .eq("batch_id", batchId);

  const completedSlots = new Set(
    (existing ?? []).filter((m) => m.generation_status === "completed").map((m) => m.slot)
  );

  return DAILY_SLOTS.filter((s) => !completedSlots.has(s.slot));
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

interface RunSlotArgs {
  slot: SlotSpec;
  archetypeId: string;
  archetypeGuidance: string;
  sceneBriefJson: import("@/lib/sceneBrief").SceneBriefJson;
  sceneBriefDoctrine: string;
  character: {
    visual_brief: string;
    sacred_details: Record<string, unknown> | null;
    soul_id: string | null;
  };
  arcPosition: string;
  batchId: string;
  storyDayId: string;
  characterId: string;
  doctrine: DoctrineKey;
  carouselSlide?: CarouselSlide;
  isRetry?: boolean;
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
    const result = await generateSlotPrompt({
      doctrine: args.doctrine,
      slot: args.slot,
      archetypeId: args.archetypeId,
      archetypeGuidance: args.archetypeGuidance,
      sceneBriefJson: args.sceneBriefJson,
      sceneBriefDoctrine: args.sceneBriefDoctrine,
      character: args.character,
      arcPosition: args.arcPosition,
      carouselSlide: args.carouselSlide,
    });

    const { error: updErr } = await supabase
      .from("chs_media")
      .update({
        higgsfield_prompt: result.prompt,
        visual_signature: result.visualSignature,
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
    const slot = DAILY_SLOTS.find((s) => s.slot === row.slot);
    if (!slot) continue;

    const { data: char } = await supabase
      .from("chs_characters")
      .select("*")
      .eq("id", row.chs_daily_plans.character_id)
      .single();

    const { data: storyDay } = await supabase
      .from("chs_story_days")
      .select("arc_position, drift_seeds")
      .eq("id", row.chs_daily_plans.story_day_id)
      .single();

    if (!char || !storyDay) continue;

    const guidance = await getArchetypeGuidance(row.shot_archetype);
    const doctrine = resolveDoctrine((char as { prompt_doctrine?: unknown }).prompt_doctrine);
    const seeds = ((storyDay as { drift_seeds?: Array<{ kind: string }> }).drift_seeds) ?? [];
    const strangerActive = seeds.some((s) => s.kind === "recurring_stranger");
    const filteredChar = {
      ...char,
      sacred_details: filterSacredForGeneration(
        (char as { sacred_details?: Record<string, unknown> }).sacred_details ?? null,
        strangerActive
      ),
    };

    try {
      await supabase
        .from("chs_media")
        .update({
          generation_status: "retrying",
          retry_count: row.retry_count + 1,
        })
        .eq("id", row.id);

      const result = await generateSlotPrompt({
        doctrine,
        slot,
        archetypeId: row.shot_archetype,
        archetypeGuidance: guidance,
        sceneBriefJson: row.chs_daily_plans.scene_brief,
        sceneBriefDoctrine: row.chs_daily_plans.scene_brief_doctrine,
        character: filteredChar,
        arcPosition: storyDay.arc_position,
      });

      await supabase
        .from("chs_media")
        .update({
          higgsfield_prompt: result.prompt,
          visual_signature: result.visualSignature,
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

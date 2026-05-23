import { supabase } from "@/lib/supabase";
import {
  DAILY_SLOTS,
  SlotSpec,
  pickArchetypesForBatch,
  logArchetypeUsage,
  getArchetypeGuidance,
} from "@/lib/archetypeDeck";
import { generateSceneBrief } from "@/lib/sceneBrief";
import { generateSlotPrompt } from "@/lib/slotPrompts";

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
    const brief = await generateSceneBrief({
      storyScene: {
        location: storyDay.location,
        mood: storyDay.mood,
        narrative: storyDay.narrative,
        arc_position: storyDay.arc_position,
        emotional_beat: storyDay.emotional_beat ?? null,
        scene: storyDay.scene ?? null,
      },
      character: {
        name: character.name,
        visual_brief: character.visual_brief,
        sacred_details: character.sacred_details ?? null,
        visual_tone: character.visual_tone ?? null,
        styling_note: character.styling_note ?? null,
      },
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
          character,
          arcPosition: storyDay.arc_position,
          batchId,
          storyDayId,
          characterId,
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
          character,
          arcPosition: storyDay.arc_position,
          batchId,
          storyDayId,
          characterId,
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
      slot: args.slot,
      archetypeId: args.archetypeId,
      archetypeGuidance: args.archetypeGuidance,
      sceneBriefJson: args.sceneBriefJson,
      sceneBriefDoctrine: args.sceneBriefDoctrine,
      character: args.character,
      arcPosition: args.arcPosition,
    });

    const { error: updErr } = await supabase
      .from("chs_media")
      .update({
        higgsfield_prompt: result.prompt,
        visual_signature: result.visualSignature,
        generation_status: "completed",
        last_error: null,
        prompt_doctrine: "cinematic",
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
      .select("arc_position")
      .eq("id", row.chs_daily_plans.story_day_id)
      .single();

    if (!char || !storyDay) continue;

    const guidance = await getArchetypeGuidance(row.shot_archetype);

    try {
      await supabase
        .from("chs_media")
        .update({
          generation_status: "retrying",
          retry_count: row.retry_count + 1,
        })
        .eq("id", row.id);

      const result = await generateSlotPrompt({
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
          visual_signature: result.visualSignature,
          generation_status: "completed",
          last_error: null,
          prompt_doctrine: "cinematic",
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

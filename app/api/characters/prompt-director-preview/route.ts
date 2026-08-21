import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DAILY_SLOTS, getArchetypeGuidance } from "@/lib/archetypeDeck";
import { promptDirectorTargetForSlot, plannedActionForReelArchetype } from "@/lib/dailyBatch";
import { compilePromptDirector } from "@/lib/promptDirector";
import { writeSoul2Prompt } from "@/lib/promptDirector/promptWriter";
import { isFlagOn } from "@/lib/featureFlags";
import type { PromptDirectorInput, PromptDirectorOutputType, PromptDirectorTargetModel, VideoIntent, VideoIntentMode, SpeechSource } from "@/lib/promptDirector";

export const runtime = "nodejs";

// Live A/B preview for prompt_director_v1 (spec §24/§29): compiles the SAME SceneBrief/slot/
// archetype a given chs_media row already has through lib/promptDirector, WITHOUT writing
// anything back to the DB and WITHOUT requiring the character's feature_flags.prompt_director_v1
// to be on. This is what lets the dashboard show old vs. new prompt side by side before flipping
// the flag for real.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      mediaId,
      targetModel,
      videoMode,
      durationSec,
      action,
      cameraBehavior,
      speechSource,
      speechText,
      speechLanguage,
      speechTone,
      speechPace,
    } = body as {
      mediaId?: string;
      targetModel?: PromptDirectorTargetModel;
      videoMode?: VideoIntentMode;
      durationSec?: number;
      action?: string;
      cameraBehavior?: string;
      speechSource?: SpeechSource;
      speechText?: string;
      speechLanguage?: string;
      speechTone?: string;
      speechPace?: string;
    };

    if (!mediaId) {
      return NextResponse.json({ error: "mediaId is required" }, { status: 400 });
    }

    const { data: media, error: mediaErr } = await supabase
      .from("chs_media")
      .select("id, slot, type, channel, sequence_index, shot_archetype, higgsfield_prompt, batch_id")
      .eq("id", mediaId)
      .single();
    if (mediaErr || !media) return NextResponse.json({ error: "Media not found" }, { status: 404 });
    if (!media.shot_archetype) return NextResponse.json({ error: "This slot has no archetype assigned yet — regenerate the daily batch first" }, { status: 422 });

    const { data: plan, error: planErr } = await supabase
      .from("chs_daily_plans")
      .select("character_id, scene_brief, story_day_id")
      .eq("id", media.batch_id)
      .single();
    if (planErr || !plan?.scene_brief) return NextResponse.json({ error: "Scene brief not found for this batch" }, { status: 404 });

    const { data: character, error: charErr } = await supabase
      .from("chs_characters")
      .select("id, name, visual_brief, sacred_details, soul_id, feature_flags")
      .eq("id", plan.character_id)
      .single();
    if (charErr || !character) return NextResponse.json({ error: "Character not found" }, { status: 404 });

    // F1/F3 — same tier/day-number context real batch generation feeds into the director (see
    // lib/dailyBatch.ts's generateSlotPromptViaDirector). Without this, the preview silently
    // diverged from what a real generation actually compiles/stores — the exact production
    // incident this fixes (2026-08-22): switching provider in the UI showed a stale, pre-F1/F2/F3
    // structure instead of what chs_media.higgsfield_prompt genuinely contains.
    const { data: storyDay } = plan.story_day_id
      ? await supabase.from("chs_story_days").select("tier, day_number").eq("id", plan.story_day_id).maybeSingle()
      : { data: null as { tier?: string | null; day_number?: number | null } | null };
    const luxuryWorldEnabled = isFlagOn((character as { feature_flags?: unknown }).feature_flags, "luxury_world_v1");
    const promptWriterOn = isFlagOn((character as { feature_flags?: unknown }).feature_flags, "prompt_writer_v1");

    // The exact SlotSpec instance used at generation time isn't persisted (only slot NAME/type/
    // channel are, on chs_media) — DAILY_SLOTS carries the same framing text for a given slot name
    // in the common (non-discovery-mode) case, which is representative enough for a prompt preview.
    const slot = DAILY_SLOTS.find((s) => s.slot === media.slot);
    if (!slot) return NextResponse.json({ error: `Unknown slot "${media.slot}"` }, { status: 422 });

    const defaults = promptDirectorTargetForSlot(slot);
    const isVideo = slot.type === "video";
    const resolvedTargetModel = targetModel ?? defaults.targetModel;
    const outputType: PromptDirectorOutputType = !isVideo
      ? "image"
      : videoMode === "talking_to_camera"
        ? "talking_video"
        : "video";

    let videoIntent: VideoIntent | undefined;
    if (isVideo) {
      videoIntent = {
        mode: videoMode ?? "motion_only",
        durationSec,
        action: action?.trim() || undefined,
        cameraBehavior: cameraBehavior?.trim() || undefined,
        speech:
          speechSource && speechSource !== "none"
            ? { source: speechSource, text: speechText, language: speechLanguage, tone: speechTone, pace: speechPace }
            : { source: "none" },
      };
    }

    // §21 — reel_start_frame is a PHOTO slot (isVideo === false) but its whole point is becoming an
    // i2v start frame, so it's the one photo slot where videoMode/action means something: it becomes
    // plannedVideoIntent, which lib/promptDirector/imageSections.ts's firstFramePrepLines() folds
    // into the camera section.
    //
    // Manual override relationship: an explicit `videoMode` in the request body always wins (lets
    // the preview panel demonstrate "talking_to_camera" vs. a plain walking motion on the same
    // frame). Absent that, this falls back to the SAME deterministic default the automatic daily
    // batch uses (lib/dailyBatch.ts's REEL_ARCHETYPE_ACTION) — derived from the archetype actually
    // picked for this batch's reel_video sibling — so the preview honestly reflects production
    // behavior instead of silently showing less than what a real batch compile would produce.
    let plannedVideoIntent: VideoIntent | undefined;
    if (!isVideo && media.slot === "reel_start_frame") {
      if (videoMode) {
        plannedVideoIntent = { mode: videoMode, durationSec, action: action?.trim() || undefined };
      } else {
        const { data: reelVideoRow } = await supabase
          .from("chs_media")
          .select("shot_archetype")
          .eq("batch_id", media.batch_id)
          .eq("slot", "reel_video")
          .maybeSingle();
        plannedVideoIntent = { mode: "motion_only", action: plannedActionForReelArchetype(reelVideoRow?.shot_archetype ?? undefined) };
      }
    }

    const archetypeGuidance = await getArchetypeGuidance(media.shot_archetype);

    const input: PromptDirectorInput = {
      character: {
        id: character.id,
        name: character.name,
        visualBrief: character.visual_brief,
        sacredDetails: character.sacred_details,
        soulId: character.soul_id,
      },
      sceneBrief: plan.scene_brief,
      slot,
      archetypeId: media.shot_archetype,
      archetypeGuidance,
      outputType,
      generationMode: defaults.generationMode,
      targetModel: resolvedTargetModel,
      hasReferenceImage: true,
      videoIntent,
      plannedVideoIntent,
      luxuryWorldEnabled,
      tier: storyDay?.tier ?? null,
      dayNumber: storyDay?.day_number ?? null,
    };

    const promptPackage = await compilePromptDirector(input);

    // F2 — mirror lib/dailyBatch.ts's generateSlotPromptViaDirector exactly: image outputs get the
    // LLM rewrite pass when prompt_writer_v1 is on, with a guaranteed fallback to the deterministic
    // compile above on any failure. `promptPackage` itself stays the raw deterministic sections
    // (still shown as "Advanced Prompt Details" in the UI) — `finalPrompt` is what the visible
    // textbox / actual generation call should use, exactly matching what a real batch run produces.
    const finalPrompt =
      promptWriterOn && outputType === "image"
        ? await writeSoul2Prompt(
            promptPackage.positivePrompt,
            plan.scene_brief.wardrobe_lock,
            plan.scene_brief.spatial_setup,
            promptPackage.positivePrompt
          )
        : promptPackage.positivePrompt;

    return NextResponse.json({ success: true, promptPackage, finalPrompt, existingPrompt: media.higgsfield_prompt });
  } catch (err) {
    console.error("[prompt-director-preview]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
}

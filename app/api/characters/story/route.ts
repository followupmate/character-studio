import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDailyBatch } from "@/lib/dailyBatch";
import { StoryTier, ContentPhase } from "@/lib/storyTier";
import { Character, StoryDay } from "@/types";
import { isFlagOn } from "@/lib/featureFlags";
import { maybeCreateLifeEvent } from "@/lib/lifeState";
import { generateStoryDayContent } from "@/lib/storyGeneration";
import { maybeAutoPlanArc, getActiveArc, getArcDayContext, arcContextBlock } from "@/lib/arcPlanner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    const { data: characters, error: charError } = await supabase
      .from("chs_characters")
      .select("*")
      .eq("is_active", true);

    if (charError) throw charError;
    if (!characters || characters.length === 0) {
      return NextResponse.json({ success: true, message: "No active characters" });
    }

    const today = new Date().toISOString().split("T")[0];

    const storyResults: Array<{
      char: Character;
      storyDayId: string;
      dayNumber: number;
      tier: StoryTier;
      driftSeeds: ContentPhase[];
      created: boolean;
    }> = [];

    for (const char of characters as Character[]) {
      const { data: existing } = await supabase
        .from("chs_story_days")
        .select("id, day_number, tier, drift_seeds")
        .eq("character_id", char.id)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        storyResults.push({
          char,
          storyDayId: existing.id,
          dayNumber: existing.day_number,
          tier: (existing.tier as StoryTier) ?? "everyday_life",
          driftSeeds: (existing.drift_seeds as ContentPhase[]) ?? [],
          created: false,
        });
        continue;
      }

      const { data: history } = await supabase
        .from("chs_story_days")
        .select("day_number, location, mood, narrative, arc_position")
        .eq("character_id", char.id)
        .order("day_number", { ascending: false })
        .limit(7);

      const dayNumber = ((history as StoryDay[])?.[0]?.day_number ?? 0) + 1;
      const lifeOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "life_layer");
      const arcOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "arc_planner_v1");

      let arcId: string | null = null;
      let arcType: string | null = null;
      let episodeLabel: string | null = null;
      let arcContextText: string | undefined;
      let arcCityOverride: string | undefined;

      if (arcOn) {
        // Non-fatal by design (same contract as maybeCreateLifeEvent below): the arc layer is
        // guidance — a failed plan/fetch must never take down the day's story generation.
        try {
          await maybeAutoPlanArc(char.id, today);
        } catch (err) {
          console.error(`[story] maybeAutoPlanArc non-fatal failure for ${char.slug}:`, err);
        }
        try {
          const arc = await getActiveArc(char.id, today);
          if (arc) {
            arcId = arc.id;
            arcType = arc.arc_type;
            const ctx = getArcDayContext(arc, today);
            if (ctx) {
              episodeLabel = `${arc.city} — day ${ctx.dayIndex}/${ctx.dayCount}`;
              arcContextText = arcContextBlock(ctx, arc);
              arcCityOverride = arc.city;
            }
          }
        } catch (err) {
          console.error(`[story] getActiveArc non-fatal failure for ${char.slug}:`, err);
        }
      }

      const { story, tier, driftSeeds, family, magnetism, strategyInput } = await generateStoryDayContent({
        character: char,
        dayNumber,
        targetDate: today,
        historyRows: (history as StoryDay[]) ?? [],
        arcContext: arcContextText,
      });

      // Prepare life_state with arc city override if needed
      let lifeStateToInsert = story.life_state;
      if (arcOn && arcCityOverride && lifeStateToInsert) {
        lifeStateToInsert = {
          ...(lifeStateToInsert as Record<string, unknown>),
          current_city: arcCityOverride,
        };
      }

      const { data: storyDay, error: storyError } = await supabase
        .from("chs_story_days")
        .insert({
          character_id: char.id,
          day_number: dayNumber,
          date: today,
          location: story.location,
          mood: story.mood,
          narrative: story.narrative,
          arc_position: story.arc_position,
          emotional_beat: story.emotional_beat,
          scene: story.scene,
          tier,
          ...(family ? { moment_family: family } : {}),
          ...(magnetism ? { magnetism_level: magnetism } : {}),
          drift_seeds: driftSeeds,
          next_hint: story.next_hint,
          ig_caption: story.ig_caption,
          hashtags: story.hashtags,
          ...(story.hook_text ? { hook_text: story.hook_text } : {}),
          ...(lifeOn && lifeStateToInsert ? { life_state: lifeStateToInsert } : {}),
          ...(arcId ? { arc_id: arcId } : {}),
          ...(episodeLabel ? { episode_label: episodeLabel } : {}),
          // creative_intelligence_generation_v1 — provenance, written ONLY when a real CI
          // recommendation was actually applied today; otherwise all 5 columns stay NULL
          // (never a placeholder value) so `WHERE strategy_snapshot_id IS NOT NULL` cleanly
          // selects "days CI actually influenced" for future closed-loop measurement.
          ...(strategyInput
            ? {
                strategy_source: "creative_intelligence",
                strategy_snapshot_id: strategyInput.strategy_snapshot_id,
                recommendation_rank: strategyInput.recommendation_rank,
                recommendation_category: strategyInput.category,
                evidence_post_ids: strategyInput.evidencePostIds,
              }
            : {}),
        })
        .select("id, day_number")
        .single();

      if (storyError) throw storyError;

      // LIFE LAYER: occasionally spawn a small everyday event for upcoming days (never daily).
      // With arc_planner, events only spawn during home_interlude arcs (micro-beats at home;
      // trips come exclusively from planned arcs, so weekend_trip is excluded from the deck).
      const shouldSpawnEvent = !arcOn || arcType === "home_interlude";
      if (lifeOn && shouldSpawnEvent) {
        try {
          await maybeCreateLifeEvent({
            characterId: char.id,
            date: today,
            ...(arcOn ? { excludeEventTypes: ["weekend_trip"] } : {}),
          });
        } catch { /* non-fatal */ }
      }
      storyResults.push({
        char,
        storyDayId: storyDay.id,
        dayNumber: storyDay.day_number,
        tier,
        driftSeeds,
        created: true,
      });
    }

    const batchResults = await Promise.allSettled(
      storyResults.map(({ char, storyDayId }) =>
        generateDailyBatch({ characterId: char.id, storyDayId })
      )
    );

    const results = storyResults.map(({ char, dayNumber, tier, driftSeeds, created }, i) => {
      const r = batchResults[i];
      if (r.status === "rejected") {
        console.error(`[story] batch failed for ${char.name}:`, r.reason);
        return {
          character: char.name,
          day: dayNumber,
          tier,
          driftSeeds: driftSeeds.map((s) => s.kind),
          storyCreated: created,
          batchStatus: "failed",
          error: String(r.reason).slice(0, 500),
        };
      }
      return {
        character: char.name,
        day: dayNumber,
        tier,
        driftSeeds: driftSeeds.map((s) => s.kind),
        storyCreated: created,
        batchStatus: r.value.status,
        slotsGenerated: r.value.generated.filter((g) => g.ok).length,
        slotsFailed: r.value.generated.filter((g) => !g.ok).length,
      };
    });

    return NextResponse.json({ success: true, processed: results });
  } catch (error) {
    console.error("[story] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

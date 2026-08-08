import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDailyBatch } from "@/lib/dailyBatch";
import { StoryDay } from "@/types";
import { isFlagOn } from "@/lib/featureFlags";
import { maybeCreateLifeEvent } from "@/lib/lifeState";
import { generateStoryDayContent } from "@/lib/storyGeneration";
import type { Character } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    // Supabase error shape: { message, code, details, hint }
    if (typeof e.message === "string") return `${e.code ?? ""} ${e.message} ${e.details ?? ""}`.trim();
    return JSON.stringify(e).slice(0, 300);
  }
  return String(err).slice(0, 300);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Optional `date` backfills a single specific date (fills gaps that the forward loop can't reach).
    const specificDate = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : undefined;
    const days = specificDate ? 1 : Math.min(Math.max(1, Number(body.days) || 7), 14);
    const characterIdFilter = body.character_id as string | undefined;

    let charQuery = supabase
      .from("chs_characters")
      .select("*")
      .eq("is_active", true);
    if (characterIdFilter) charQuery = charQuery.eq("id", characterIdFilter);

    const { data: characters, error: charErr } = await charQuery;
    if (charErr) throw charErr;
    if (!characters || characters.length === 0) {
      return NextResponse.json({ success: true, generated: [] });
    }

    const allResults: Array<{
      character: string;
      days: Array<{ date: string; day_number: number; tier: string; status: string; error?: string }>;
    }> = [];

    for (const char of characters as Character[]) {
      const charResult: (typeof allResults)[0] = { character: char.name, days: [] };

      // Query latest story_day ONCE before the loop — date/dayNumber track locally
      const { data: latestData } = await supabase
        .from("chs_story_days")
        .select("day_number, date")
        .eq("character_id", char.id)
        .order("day_number", { ascending: false })
        .limit(1);

      const latestRow = (latestData as StoryDay[])?.[0];
      const todayStr = new Date().toISOString().split("T")[0];
      let nextDayNumber = (latestRow?.day_number ?? 0) + 1;
      // specificDate backfills exactly that day; otherwise continue forward from the latest day.
      let nextDate = specificDate ?? (latestRow?.date ? addDays(latestRow.date, 1) : addDays(todayStr, 0));

      for (let i = 0; i < days; i++) {
        const targetDate = nextDate;
        const dayNumber = nextDayNumber;

        // Skip if this date already exists
        const { data: existing } = await supabase
          .from("chs_story_days")
          .select("id")
          .eq("character_id", char.id)
          .eq("date", targetDate)
          .maybeSingle();

        if (existing) {
          charResult.days.push({ date: targetDate, day_number: dayNumber, tier: "skip", status: "already_exists" });
          nextDate = addDays(nextDate, 1);
          nextDayNumber++;
          continue;
        }

        try {
          const { data: history } = await supabase
            .from("chs_story_days")
            .select("day_number, location, mood, narrative, arc_position")
            .eq("character_id", char.id)
            .order("day_number", { ascending: false })
            .limit(7);

          const lifeOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "life_layer");

          const { story, tier, driftSeeds, family, magnetism, strategyInput } = await generateStoryDayContent({
            character: char,
            dayNumber,
            targetDate,
            historyRows: (history as StoryDay[]) ?? [],
          });

          const insertPayload: Record<string, unknown> = {
            character_id: char.id,
            day_number: dayNumber,
            date: targetDate,
            location: story.location,
            mood: story.mood,
            narrative: story.narrative,
            arc_position: story.arc_position,
            emotional_beat: story.emotional_beat,
            scene: story.scene,
            tier,
            drift_seeds: driftSeeds,
            next_hint: story.next_hint,
            ig_caption: story.ig_caption,
            hashtags: story.hashtags,
          };
          if (family) insertPayload.moment_family = family;
          if (magnetism) insertPayload.magnetism_level = magnetism;
          if (story.hook_text) insertPayload.hook_text = story.hook_text;
          if (lifeOn && story.life_state) insertPayload.life_state = story.life_state;
          // creative_intelligence_generation_v1 — see app/api/characters/story/route.ts for the
          // same provenance-only-when-applied rule.
          if (strategyInput) {
            insertPayload.strategy_source = "creative_intelligence";
            insertPayload.strategy_snapshot_id = strategyInput.strategy_snapshot_id;
            insertPayload.recommendation_rank = strategyInput.recommendation_rank;
            insertPayload.recommendation_category = strategyInput.category;
            insertPayload.evidence_post_ids = strategyInput.evidencePostIds;
          }

          const { data: storyDay, error: storyError } = await supabase
            .from("chs_story_days")
            .insert(insertPayload)
            .select("id")
            .single();

          if (storyError) throw storyError;

          // LIFE LAYER: occasionally spawn a small everyday event (never daily).
          if (lifeOn) {
            try { await maybeCreateLifeEvent({ characterId: char.id, date: targetDate }); } catch { /* non-fatal */ }
          }

          const batch = await generateDailyBatch({ characterId: char.id, storyDayId: storyDay.id });

          charResult.days.push({ date: targetDate, day_number: dayNumber, tier, status: batch.status });
        } catch (err) {
          charResult.days.push({
            date: targetDate,
            day_number: dayNumber,
            tier: "unknown",
            status: "failed",
            error: errMsg(err),
          });
        }

        // Always advance — even on failure, next iteration uses the next date
        nextDate = addDays(nextDate, 1);
        nextDayNumber++;
      }

      allResults.push(charResult);
    }

    return NextResponse.json({ success: true, generated: allResults });
  } catch (error) {
    console.error("[generate-forward]", error);
    return NextResponse.json({ success: false, error: errMsg(error) }, { status: 500 });
  }
}

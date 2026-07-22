import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateDailyBatch } from "@/lib/dailyBatch";
import { claudeWithRetry } from "@/lib/generatePrompts";
import {
  pickTier,
  pickDriftSeeds,
  tierGuidance,
  driftSeedGuidance,
  pickMomentFamily,
  pickMagnetismLevel,
  getLastMomentFamily,
  StoryTier,
  ContentPhase,
  MomentFamily,
  MagnetismLevel,
} from "@/lib/storyTier";
import { Character, StoryDay } from "@/types";
import { isFlagOn } from "@/lib/featureFlags";
import { VOICE_DOCTRINE, DISCOVERY_DOCTRINE } from "@/lib/storyPrompt";
import { getLatestLifeState, getActiveLifeEvents, lifeContextBlock, LIFE_OUTPUT_SPEC, maybeCreateLifeEvent } from "@/lib/lifeState";
import { getGrowthBias } from "@/lib/growthScore";

export const runtime = "nodejs";
export const maxDuration = 300;

function buildSystemPrompt(args: {
  character: Character;
  tier: StoryTier;
  driftSeeds: ContentPhase[];
  dayNumber: number;
  historyText: string;
  lifeContext?: string; // life_layer: continuity guidance from yesterday's life_state + active events
  discoveryMode?: boolean; // discovery_mode: reach-first caption/hook editorial
  family?: MomentFamily | null; // lived_moments: today's world
  magnetism?: MagnetismLevel | null; // lived_moments: today's intensity
}): string {
  const { character, tier, driftSeeds, historyText, lifeContext, discoveryMode, family, magnetism } = args;
  const lifeOn = lifeContext !== undefined;
  const personality = character.personality ?? {};
  const sacred = (character as Character & { sacred_details?: unknown }).sacred_details ?? null;

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
${tierGuidance(tier, { family, magnetism })}

${driftSeedGuidance(driftSeeds)}
${lifeContext ? `\n${lifeContext}\n` : ""}
VOICE ANCHOR — read recent history ONLY to avoid repeating the same city or scene two days in a row.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
- location: string (specific micro-location for today's tier — everyday: "her apartment kitchen", "neighbourhood café"; wellness: "pilates studio", "gym"; intimate: "her bedroom, unmade bed", "bathroom mirror"; travel: city + spot. Concrete and physical.)
- mood: string (1 to 3 words, warm or candid — "unhurried", "earned", "golden", "easy")
- narrative: 2 to 3 sentences obeying the voice doctrine
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: present | playful | sultry | golden | effortless | candid | intimate | wandering | languid | aspirational
- scene: structured object with keys: time_of_day, weather, wardrobe, props (array), motifs (array), energy
- next_hint: one sentence hint of tomorrow
- ig_caption: 1 to 2 lines. lowercase. no hashtags. everyday: warm, one real detail. wellness: confident, earned-glow. intimate: daring with a quiet invitation ("woke up like this. stayed like this.", "you only get the rest of this somewhere else 😏"). travel: name place + observation.
- hook_text: OPTIONAL 2-5 word overlay text for carousel (~35% of days only). everyday: "slow morning". wellness: "earned it". intimate: "do not disturb", "come find me". travel: location-punchy. Omit entirely if no strong hook.
- hashtags: array of 10 strings without # (tier-appropriate lifestyle/wellness/aesthetic/niche/branded mix; avoid spammy adult tags that risk the account)
${lifeOn ? LIFE_OUTPUT_SPEC + "\n" : ""}
ALL text fields in English.`;
}

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

          const reversed = ((history as StoryDay[]) ?? []).slice().reverse();
          const historyText =
            reversed.length > 0
              ? reversed.map((d) => `Day ${d.day_number}: ${d.location} — ${d.mood} — ${d.narrative}`).join("\n")
              : "First day. No history yet.";

          // GROWTH LAYER (flag-gated): gentle, capped tier bias (no-op until ≥10 reels w/ metrics).
          const growthOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "growth_layer");
          const tierBias = growthOn ? (await getGrowthBias(char.id))?.modifier : undefined;
          const tier = await pickTier(char.id, 6, tierBias);
          const driftSeeds = await pickDriftSeeds(char.id, dayNumber);

          // LIFE LAYER (flag-gated): yesterday's life_state + active events as continuity guidance.
          const lifeOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "life_layer");
          let lifeContext: string | undefined;
          if (lifeOn) {
            const [prevLife, activeEvents] = await Promise.all([
              getLatestLifeState(char.id, targetDate),
              getActiveLifeEvents(char.id, targetDate),
            ]);
            lifeContext = lifeContextBlock(prevLife, activeEvents);
          }

          const discoveryMode = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "discovery_mode");

          // lived_moments only: pick today's world (anti-repeat vs the last lived_moments day) + magnetism.
          const family = tier === "lived_moments" ? pickMomentFamily(await getLastMomentFamily(char.id)) : null;
          const magnetism = tier === "lived_moments" ? pickMagnetismLevel() : null;

          const system = buildSystemPrompt({ character: char, tier, driftSeeds, dayNumber, historyText, lifeContext, discoveryMode, family, magnetism });

          const msg = await claudeWithRetry({
            model: "claude-sonnet-4-6",
            max_tokens: 1800,
            system,
            messages: [
              { role: "user", content: `Day ${dayNumber}. Generate today's chapter. Pick a single emotional beat — do not blend.` },
            ],
          });

          const rawText = (msg.content[0] as { type: string; text: string }).text;
          const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
          let story: Record<string, unknown>;
          try {
            story = JSON.parse(jsonText);
          } catch {
            throw new Error(`Story JSON parse failed. Claude returned: ${rawText.slice(0, 300)}`);
          }

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

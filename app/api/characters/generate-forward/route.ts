import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { anthropic } from "@/lib/anthropic";
import { generateDailyBatch } from "@/lib/dailyBatch";
import {
  pickTier,
  pickDriftSeeds,
  tierGuidance,
  driftSeedGuidance,
  StoryTier,
  ContentPhase,
} from "@/lib/storyTier";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const VOICE_DOCTRINE = `VOICE DOCTRINE (mandatory — overrides anything in recent history that drifted off-tone)

You are writing for a luxury travel + confident aesthetic Instagram account. Two modes, one voice.

LIFESTYLE_TRAVEL tier: Viewer wants to be her, or be where she is. Warm, sharp, location-anchored.
INTIMATE_AESTHETIC tier: Viewer wants to be with her. Body-aware, slightly daring, self-possessed. The caption carries an edge.

WRITE LIKE:
- first or third person, present or recent past tense
- direct and personal — like a note someone wasn't supposed to read
- name the place (travel) or describe the fabric/light/body (intimate)
- healthy confidence — she knows she looks good and doesn't apologise for it
- leave desire in the room — never explain the image, let the caption tighten around it

NEVER WRITE:
- influencer vocabulary: "healing", "soft life", "main character", "era", "manifesting", "vibe check", "slay", "girlboss"
- hollow affirmations: "life is beautiful", "every day is a gift", "grateful and blessed"
- generic travel blog: "hidden gem", "breathtaking", "magical", "wanderlust"
- emoji chains (one emoji maximum if it adds — no 🌅🤍✨💫 clusters)
- rhetorical questions to audience: "Who else loves Paris?", "Can you believe this view??"
- over-describing the body explicitly — the provocation is through confidence and indirection

GOOD (travel): "lisbon at 7am before anyone wakes up. the light does something different here."
GOOD (intimate): "the mirror in this room is doing something illegal."
GOOD (intimate): "woke up like this. stayed like this."
BAD: "Living my best life in the eternal city! ✨ So grateful for these moments 🙏"`;

function buildSystemPrompt(args: {
  character: Character;
  tier: StoryTier;
  driftSeeds: ContentPhase[];
  dayNumber: number;
  historyText: string;
}): string {
  const { character, tier, driftSeeds, historyText } = args;
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

${tierGuidance(tier)}

${driftSeedGuidance(driftSeeds)}

VOICE ANCHOR — read recent history ONLY to avoid repeating the same city or scene two days in a row.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
- location: string (city + specific micro-location)
- mood: string (1 to 3 words, warm or candid — "golden", "unhurried", "arriving")
- narrative: 2 to 3 sentences obeying the voice doctrine
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: present | playful | sultry | golden | effortless | candid | intimate | wandering | languid | aspirational
- scene: structured object with keys: time_of_day, weather, wardrobe, props (array), motifs (array), energy
- next_hint: one sentence hint of tomorrow
- ig_caption: 1 to 2 lines. lowercase. no hashtags. lifestyle_travel: name city + sharp observation. intimate_aesthetic: daring edge ("the robe doesn't stay on long here", "woke up like this. stayed like this.").
- hook_text: OPTIONAL 2-5 word overlay text for carousel (~35% of days only). lifestyle_travel: location-punchy. intimate_aesthetic: body-confident. Omit entirely if no strong hook.
- hashtags: array of 10 strings without #

ALL text fields in English.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const days = Math.min(Math.max(1, Number(body.days) || 7), 14);
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

      for (let i = 0; i < days; i++) {
        // Find the next date to generate (after latest existing story_day)
        const { data: latest } = await supabase
          .from("chs_story_days")
          .select("day_number, date")
          .eq("character_id", char.id)
          .order("day_number", { ascending: false })
          .limit(1);

        const latestDay = (latest as StoryDay[])?.[0];
        const dayNumber = (latestDay?.day_number ?? 0) + 1;

        // Next date: +1 day from latest, or tomorrow if no history
        const baseDate = latestDay?.date
          ? new Date(latestDay.date + "T12:00:00Z")
          : new Date();
        baseDate.setUTCDate(baseDate.getUTCDate() + 1);
        const targetDate = baseDate.toISOString().split("T")[0];

        // Skip if this date already exists
        const { data: existing } = await supabase
          .from("chs_story_days")
          .select("id")
          .eq("character_id", char.id)
          .eq("date", targetDate)
          .maybeSingle();

        if (existing) {
          charResult.days.push({ date: targetDate, day_number: dayNumber, tier: "skip", status: "already_exists" });
          continue;
        }

        try {
          // Get recent history (last 7 days)
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

          const tier = await pickTier(char.id);
          const driftSeeds = await pickDriftSeeds(char.id, dayNumber);

          const system = buildSystemPrompt({ character: char, tier, driftSeeds, dayNumber, historyText });

          const msg = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1800,
            system,
            messages: [
              { role: "user", content: `Day ${dayNumber}. Generate today's chapter. Pick a single emotional beat — do not blend.` },
            ],
          });

          const rawText = (msg.content[0] as { type: string; text: string }).text;
          const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
          const story = JSON.parse(jsonText);

          const { data: storyDay, error: storyError } = await supabase
            .from("chs_story_days")
            .insert({
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
              ...(story.hook_text ? { hook_text: story.hook_text } : {}),
            })
            .select("id")
            .single();

          if (storyError) throw storyError;

          const batch = await generateDailyBatch({ characterId: char.id, storyDayId: storyDay.id });

          charResult.days.push({
            date: targetDate,
            day_number: dayNumber,
            tier,
            status: batch.status,
          });
        } catch (err) {
          charResult.days.push({
            date: targetDate,
            day_number: dayNumber,
            tier: "unknown",
            status: "failed",
            error: String(err).slice(0, 300),
          });
        }
      }

      allResults.push(charResult);
    }

    return NextResponse.json({ success: true, generated: allResults });
  } catch (error) {
    console.error("[generate-forward]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

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
  DriftSeed,
} from "@/lib/storyTier";
import { Character, StoryDay } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const VOICE_DOCTRINE = `VOICE DOCTRINE (mandatory — overrides anything in recent history that drifted off-tone)

You are not writing for an Instagram audience. You are writing atmospheric residue. The viewer must feel they overheard a sentence, not read a caption.

WRITE LIKE:
- short declarative sentences, 5 to 14 words each
- present tense, third person
- describe weather, transit, light, hands, surfaces, sounds, objects
- mention people only as silhouettes, never named, never spoken to
- mention objects without explaining why they are there
- leave contradictions unresolved

NEVER WRITE:
- "she feels", "she remembers", "she wonders", "she realizes", "she misses", "she thinks"
- "the city wakes up", "her heart", "the world holds its breath"
- "as the sun sets / as she walks / as the wind blows" — no narrative connectives
- references to a past life, a career, a person she once knew
- emoji, exclamation marks, rhetorical questions
- tourist-blog vocabulary: vibrant, charming, hidden gem, magical, breathtaking, postcard
- influencer vocabulary: moments, energy, vibes, main character, soft girl, soft life, era, healing
- adjectives that perform meaning: ethereal, dreamy, surreal, poetic, cinematic

GOOD: "the escalator stops at the same step every morning. she does not move with it. the man behind her does."
GOOD: "three mandarins again. she puts them in the pocket of her coat. one rolls back out."
GOOD: "the train glass holds two reflections that do not match."
GOOD: "the convenience store at six is louder than it should be."

BAD: "she walks through tokyo's vibrant streets, soaking in the morning energy."
BAD: "another magical day in a city that feels like home."
BAD: "her heart aches for marseille."
BAD: "she feels the weight of distance settling into her bones."`;

function buildSystemPrompt(args: {
  character: Character;
  tier: StoryTier;
  driftSeeds: DriftSeed[];
  dayNumber: number;
  historyText: string;
}): string {
  const { character, tier, driftSeeds, historyText } = args;
  const personality = character.personality ?? {};
  const sacred = (character as Character & { sacred_details?: unknown }).sacred_details ?? null;

  return `You are the story director for ${character.name}.

CHARACTER BACKSTORY (atmospheric residue — do not paraphrase, do not extend lore):
${character.backstory}

VISUAL BRIEF:
${character.visual_brief}

PERSONALITY:
${JSON.stringify(personality, null, 2)}
${sacred ? `\nSACRED DETAILS (invariant world objects and rules):\n${JSON.stringify(sacred, null, 2)}` : ""}

${VOICE_DOCTRINE}

${tierGuidance(tier)}

${driftSeedGuidance(driftSeeds)}

VOICE ANCHOR — read the recent history below ONLY to avoid repeating the same location/object two days in a row. If the recent history drifted toward tourist-blog or influencer tone, IGNORE THE DRIFT and reset to the voice doctrine above. Do not match the tone of the previous days if it violates the doctrine.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
- location: string (city + specific micro-location, e.g. "Tokyo, Shinagawa station underpass")
- mood: string (1 to 3 words, neutral or flat — "cold", "uneventful", "displaced". Never "magical" / "ethereal" / "vibrant")
- narrative: 2 to 3 short declarative sentences obeying the voice doctrine
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: detached | observed | mundane | drifting | mildly_displaced | watchful | absent | uneventful | half_present | almost_there
- scene: structured object with these keys:
    {
      "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
      "weather": "short factual atmospheric state",
      "wardrobe": "her usual dark wool coat plus one small variable (collar up, cuff folded, scarf, hood). no fashion language.",
      "props": ["3 to 5 mundane objects present — tickets, fruit, coins, plastic bag, escalator handrail"],
      "motifs": ["2 to 4 visual motifs — repetition, reflection, queue, escalator step, fluorescent glow"],
      "energy": "one short phrase — flat, no register-up"
    }
- next_hint: one sentence hint of tomorrow — must obey the voice doctrine
- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. no emoji. atmospheric residue, never a takeaway. If timestamp_mismatch is active, insert the required time verbatim into the caption.
- hashtags: array of 10 strings without # (3 location · 3 atmospheric · 2 niche · 2 branded for this character)

Pick a single emotional beat — do not blend.

ALL text fields in English.`;
}

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
      driftSeeds: DriftSeed[];
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
          tier: (existing.tier as StoryTier) ?? "grounded_routine",
          driftSeeds: (existing.drift_seeds as DriftSeed[]) ?? [],
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
      const reversed = ((history as StoryDay[]) ?? []).slice().reverse();
      const historyText =
        reversed.length > 0
          ? reversed.map((d) => `Day ${d.day_number}: ${d.location} — ${d.mood} — ${d.narrative}`).join("\n")
          : "First day. No history yet.";

      const tier = await pickTier(char.id);
      const driftSeeds = await pickDriftSeeds(char.id);

      const system = buildSystemPrompt({ character: char, tier, driftSeeds, dayNumber, historyText });

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        system,
        messages: [
          { role: "user", content: `Day ${dayNumber}. Generate today's chapter. Natural continuation. Pick a single emotional beat — do not blend.` },
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
          date: today,
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
        })
        .select("id, day_number")
        .single();

      if (storyError) throw storyError;
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

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

You are writing for an aspirational travel and lifestyle Instagram account. The viewer should want to be her — or be with her. Content is warm, candid, desirable. NOT influencer fluff.

WRITE LIKE:
- first or third person, present or recent past tense
- candid, personal — like a note to a close friend, not a brand caption
- name the city, the hotel, the terrace, the view
- describe light, fabric, heat, the feeling of arriving somewhere new
- leave room for desire — the image does the work, the caption adds warmth

NEVER WRITE:
- influencer vocabulary: "healing", "soft life", "main character", "era", "manifesting", "vibe check", "girlboss", "slay"
- hollow affirmations: "life is beautiful", "every day is a gift", "grateful and blessed"
- generic travel blog: "hidden gem", "breathtaking", "magical", "wanderlust"
- emoji-as-punctuation (no 🌅🤍✨💫 unless the character's personality explicitly allows one)
- rhetorical questions addressed to the audience: "Who else loves Paris?", "Can you believe this view??"
- press-release language: "proud to partner with", "excited to announce", "truly honored"

GOOD: "lisbon at 7am before anyone wakes up. the light does something different here."
GOOD: "checked in. do not disturb."
GOOD: "still warm from the sun. the kind of afternoon you try to photograph and can't."
GOOD: "last morning in amalfi. room service and the wrong kind of quiet."
GOOD (intimate tier): "the robe they give you at this hotel is the only reason to stay."

BAD: "Living my best life in the eternal city! ✨ So grateful for these moments 🙏"
BAD: "Paris is always a good idea 🥐🗼 Who else is obsessed with this city?"
BAD: "Another magical day in paradise — truly blessed."`;

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

VOICE ANCHOR — read recent history ONLY to avoid repeating the same city or scene two days in a row. If recent history drifted toward influencer fluff or hollow affirmations, IGNORE THE DRIFT and reset to the voice doctrine above.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
- location: string (city + specific micro-location, e.g. "Tokyo, Shinagawa station underpass")
- mood: string (1 to 3 words, warm or candid — "golden", "unhurried", "arriving". Never "ethereal" / "vibrant" / "wanderlust")
- narrative: 2 to 3 sentences obeying the voice doctrine — warm, candid, location-anchored
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: present | playful | sultry | golden | effortless | candid | intimate | wandering | languid | aspirational
- scene: structured object with these keys:
    {
      "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
      "weather": "short factual atmospheric state",
      "wardrobe": "today's outfit from sacred_details wardrobe — silk, linen, minimal gold. one specific garment + how it sits. no fashion-brand language.",
      "props": ["2 to 4 props present — passport, sunglasses, coffee, champagne, hotel key, book, camera"],
      "motifs": ["2 to 4 visual motifs — golden light, reflection, coastline, architecture, shadow, texture"],
      "energy": "one short phrase — flat, no register-up"
    }
- next_hint: one sentence hint of tomorrow — must obey the voice doctrine
- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. one emoji maximum if it adds warmth (not mandatory). candid and personal, never a brand caption. lifestyle_travel tier: name the city/place. intimate_aesthetic tier: intimate and oblique ("do not disturb", "room had the best light").
- hashtags: array of 10 strings without # (3 location · 2 travel/lifestyle · 2 aesthetic · 2 niche · 1 branded for this character)

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
      const driftSeeds = await pickDriftSeeds(char.id, dayNumber);

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

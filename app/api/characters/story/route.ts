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
import { isFlagOn } from "@/lib/featureFlags";
import { getLatestLifeState, getActiveLifeEvents, lifeContextBlock, LIFE_OUTPUT_SPEC, maybeCreateLifeEvent } from "@/lib/lifeState";
import { getGrowthBias } from "@/lib/growthScore";

export const runtime = "nodejs";
export const maxDuration = 300;

const VOICE_DOCTRINE = `VOICE DOCTRINE (mandatory — overrides anything in recent history that drifted off-tone)

You are writing for an attractive young woman's lifestyle Instagram — a real-feeling daily life that
pulls followers close (parasocial girlfriend energy) and quietly funnels the most invested ones to her
private content (OnlyFans / Fanvue). Reach + closeness on IG; conversion through confidence and allure.
Four modes, one voice.

EVERYDAY_LIFE: Viewer wants to be in her life. Warm, personal, relatable — home, coffee, errands, a normal good day.
WELLNESS_FITNESS: Viewer admires her. Confident, healthy, light — gym/pilates/post-workout, earned-glow.
INTIMATE_AESTHETIC: Viewer wants more of her. Daring, self-possessed, a quiet invitation — the "come find the rest" energy that converts. Suggestive, never explicit.
LIFESTYLE_TRAVEL: Viewer wants to be where she is. Location-anchored, aspirational, occasional.

WRITE LIKE:
- first or third person, present or recent past tense
- direct and personal — like a text to someone she likes
- name the place / the moment / the fabric or light — one concrete real detail
- healthy confidence — she knows she looks good and doesn't apologise for it
- leave desire in the room — never explain the image, let the caption tighten around it

NEVER WRITE:
- influencer vocabulary: "healing", "soft life", "main character", "era", "manifesting", "vibe check", "slay", "girlboss"
- hollow affirmations: "life is beautiful", "every day is a gift", "grateful and blessed"
- generic blog filler: "hidden gem", "breathtaking", "magical", "wanderlust"
- emoji chains (one emoji maximum if it adds — no 🌅🤍✨💫 clusters)
- rhetorical questions to audience: "Who else loves this?", "Can you believe this??"
- press-release language: "proud to partner with", "excited to announce"
- over-describing the body explicitly — the provocation is through confidence and indirection, never pornographic language

GOOD (everyday): "monday. too much coffee, no plans, perfect."
GOOD (everyday): "the apartment gets this light for about twenty minutes. i wait for it."
GOOD (everyday): "didn't leave the house. don't regret it."
GOOD (wellness): "earned the matcha today."
GOOD (wellness): "two more sets than yesterday. small wins."
GOOD (intimate): "the mirror in here is doing something illegal."
GOOD (intimate): "woke up like this. stayed like this."
GOOD (intimate): "you only get the rest of this somewhere else 😏"
GOOD (travel): "lisbon at 7am before anyone wakes up. the light does something different here."

BAD: "Living my best life! ✨ So grateful for these moments 🙏"
BAD: "feeling so sexy and confident today 💋💋" — explicit self-labelling kills the provocation`;

// DISCOVERY MODE (flag: discovery_mode) — reach-first editorial for cold audience.
// Carousels/stories serve existing followers; cold reach on IG comes from a
// scroll-stopping first frame + a legible reason to follow + keyword-rich caption.
// This block overrides the hook_text / ig_caption / hashtags output rules when on.
const DISCOVERY_DOCTRINE = `DISCOVERY MODE (ACTIVE — reach-first, overrides the caption/hook/hashtag rules below)

The account is small and needs NEW followers, not just depth with existing ones. A cold viewer
sees ONE frame with zero context — no narrative, no history. Win the first 1.5 seconds and give a
reason to follow. Continuity/lore is invisible to them; do not rely on it.

HOOK_TEXT — now MANDATORY every day (not 35%). This is the on-screen overlay that stops the scroll
on the first carousel image. 2 to 6 words, lowercase. It must do ONE of: spark curiosity ("the one
thing i changed"), be relatable-specific ("nobody talks about this"), or promise a payoff ("wait for
the last one"). Concrete beats clever. Avoid vague mood words ("slow morning") in discovery mode —
those don't stop a stranger's scroll.

IG_CAPTION — hook-first structure:
  line 1 = a scroll-stopping opener (curiosity, a relatable confession, or a bold specific claim)
  line 2 = one real detail that pays off the hook (keeps the voice doctrine — no fluff)
  end = a soft follow-reason, ONE short line that tells a stranger what they get by following
        (e.g. "here most days if this is your kind of quiet", "more like this if you stay").
        Not desperate, not "follow me!!" — an invitation with self-possession.
  Weave 1 to 2 plain keywords a stranger might search (the place, the activity, the aesthetic) into
  the natural text — IG now ranks captions as search text. No keyword stuffing.

HASHTAGS — reach mix, not vanity: 4 mid-size discoverable niche tags (10k–500k posts, findable), 3
specific long-tail tags, 2 location/context tags, 1 broad. Drop dead branded tags. Never spammy adult
tags (they suppress the whole account).`;

function buildSystemPrompt(args: {
  character: Character;
  tier: StoryTier;
  driftSeeds: ContentPhase[];
  dayNumber: number;
  historyText: string;
  lifeContext?: string; // life_layer: continuity guidance from yesterday's life_state + active events
  discoveryMode?: boolean; // discovery_mode: reach-first caption/hook editorial
}): string {
  const { character, tier, driftSeeds, historyText, lifeContext, discoveryMode } = args;
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
${tierGuidance(tier)}

${driftSeedGuidance(driftSeeds)}
${lifeContext ? `\n${lifeContext}\n` : ""}
VOICE ANCHOR — read recent history ONLY to avoid repeating the same city or scene two days in a row. If recent history drifted toward influencer fluff or hollow affirmations, IGNORE THE DRIFT and reset to the voice doctrine above.

RECENT HISTORY (last 7 days, oldest first):
${historyText}

OUTPUT FORMAT — valid JSON only. No markdown, no code blocks, no explanation.

Required fields:
- location: string (the specific micro-location for today's tier — everyday: "her apartment kitchen", "neighbourhood café corner table", "city sidewalk near home"; wellness: "boutique pilates studio", "gym free-weights area", "home workout corner"; intimate: "her bedroom, unmade bed", "bathroom mirror, morning"; travel: city + spot e.g. "Amalfi, hotel terrace". Be concrete and physically specific.)
- mood: string (1 to 3 words, warm or candid — "unhurried", "earned", "golden", "easy". Never "ethereal" / "vibrant" / "wanderlust")
- narrative: 2 to 3 sentences obeying the voice doctrine — warm, candid, anchored to the moment
- arc_position: one of: opening | rising | peak | turning | falling | quiet
- emotional_beat: one of: present | playful | sultry | golden | effortless | candid | intimate | wandering | languid | aspirational
- scene: structured object with these keys:
    {
      "time_of_day": "dawn | morning | midday | golden_hour | dusk | blue_hour | night | indoor_lamp | fluorescent",
      "weather": "short factual atmospheric state (or 'indoor')",
      "wardrobe": "today's outfit — comes from the styling profile selected for this batch. one specific garment + how it sits. no fashion-brand language.",
      "props": ["1 to 3 props that fit the location — coffee/matcha mug, yoga mat, water bottle, gym bag, book, phone (face-down), groceries, sunglasses (outdoor), espresso/wine (café or evening table only)"],
      "motifs": ["2 to 4 visual motifs — morning light, window light, mirror, soft shadow, texture, reflection"],
      "energy": "one short phrase — flat, no register-up"
    }
- next_hint: one sentence hint of tomorrow — must obey the voice doctrine
- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. one emoji maximum (not mandatory). everyday: warm, relatable, one real detail. wellness: confident, light, earned-glow. intimate: daring with a quiet invitation, an edge that hints there is more elsewhere (e.g. "woke up like this. stayed like this.", "the mirror in here is doing something illegal", "you only get the rest of this somewhere else 😏"). travel: name the place, one sharp observation. Never bland.
- hook_text: OPTIONAL. Short overlay text for carousel image — include in roughly 35% of days only, when the day has a strong visual hook. 2 to 5 words, lowercase, no punctuation. everyday: "slow morning", "no plans today", "twenty minutes of light". wellness: "earned it", "two more than yesterday", "post-gym glow". intimate: "do not disturb", "the rest is private", "come find me". travel: "rome at midnight", "arrived. not leaving." Omit entirely if no strong hook emerges.
- hashtags: array of 10 strings without # (mix to fit today's tier: everyday/wellness → 3 lifestyle · 2 fitness/wellness · 2 aesthetic · 2 niche · 1 branded; travel → swap some for location tags. Avoid spammy adult tags that risk the IG account.)
${lifeOn ? LIFE_OUTPUT_SPEC + "\n" : ""}
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

      // LIFE LAYER (flag-gated): inject yesterday's life_state + active events as continuity guidance.
      const lifeOn = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "life_layer");
      let lifeContext: string | undefined;
      if (lifeOn) {
        const [prevLife, activeEvents] = await Promise.all([
          getLatestLifeState(char.id, today),
          getActiveLifeEvents(char.id, today),
        ]);
        lifeContext = lifeContextBlock(prevLife, activeEvents);
      }

      const discoveryMode = isFlagOn((char as { feature_flags?: unknown }).feature_flags, "discovery_mode");
      const system = buildSystemPrompt({ character: char, tier, driftSeeds, dayNumber, historyText, lifeContext, discoveryMode });

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
          ...(story.hook_text ? { hook_text: story.hook_text } : {}),
          ...(lifeOn && story.life_state ? { life_state: story.life_state } : {}),
        })
        .select("id, day_number")
        .single();

      if (storyError) throw storyError;

      // LIFE LAYER: occasionally spawn a small everyday event for upcoming days (never daily).
      if (lifeOn) {
        try { await maybeCreateLifeEvent({ characterId: char.id, date: today }); } catch { /* non-fatal */ }
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

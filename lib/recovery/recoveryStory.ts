import { claudeWithRetry } from "@/lib/generatePrompts";
import { STORY_COPY_RULES } from "@/lib/storyCopyRules";
import type { SceneBriefJson } from "@/lib/sceneBrief";

// RECOVERY STORY ALIGNMENT.
//
// The first integration grafted a recovery reel onto whatever story day happened to be next. The
// result was incoherent in the only place it actually matters — the post: a bedroom reel published
// under "found the bar at the right hour. the town did the rest." with #positanoitaly. That is the
// same class of semantic contradiction this whole sprint exists to remove, just moved from the
// motion layer to the caption layer.
//
// The fix is to invert it. The recovery scene BECOMES the story day. Once the day's location,
// mood, narrative and tier are the recovery scene, everything downstream derives from one source:
// the caption, the hashtags, the hook, the BTS still, and the reel. No operator reconciliation, no
// editing at approval time.
//
// The caption is written by the same rules every other day uses — STORY_COPY_RULES is imported
// verbatim from the story engine's own prompt, not restated here, so a recovery caption cannot
// drift into a different voice.

/**
 * The shape a prepared day must have for its story to be derived from it.
 *
 * Structural rather than a concrete import, so the visual/hook experiment gets the SAME derivation
 * instead of a second copy that drifts. The copy of this logic is what would reintroduce the exact
 * failure it exists to prevent: a caption describing somewhere the video is not.
 */
export interface StoryDerivableDay {
  /** 1-based index within its own experiment. */
  slot: number;
  objective: string;
  payoff: string;
  direction: string;
  brief: SceneBriefJson;
  compiled: { action: string };
}

export interface RecoveryStoryScene {
  location: string;
  mood: string;
  narrative: string;
  emotional_beat: string;
  arc_position: string;
  tier: string;
  scene: Record<string, unknown>;
}

/**
 * The story-day scene, derived from the recovery brief. Deterministic — no LLM. Every field comes
 * from the brief that already produced the reel, so the day and the reel cannot disagree.
 */
export function buildRecoveryStoryScene(day: StoryDerivableDay, indexKey = "recovery_index"): RecoveryStoryScene {
  const b = day.brief;
  return {
    location: b.spatial_setup.split("—")[0].trim().replace(/\.$/, ""),
    mood: b.color_palette.slice(0, 2).join(", "),
    narrative: day.objective,
    emotional_beat: day.payoff,
    arc_position: "quiet",
    // The tier is the recovery direction's own register, not the calendar's.
    tier: recoveryTierFor(day),
    scene: {
      location_class: b.location_class ?? null,
      action_class: b.action_class ?? null,
      time_of_day: b.time_of_day,
      weather: b.weather_implied,
      wardrobe: b.wardrobe_lock,
      props: b.scene_entities ?? [],
      motifs: b.color_palette,
      energy: day.direction,
      [indexKey]: day.slot,
    },
  };
}

/** Maps a recovery direction onto the existing tier vocabulary — no new tiers invented. */
export function recoveryTierFor(day: StoryDerivableDay): string {
  switch (day.brief.location_class) {
    case "bedroom":
    case "living_room":
      return "intimate_aesthetic";
    case "terrace_rooftop":
      return "wellness_fitness";
    case "cafe_restaurant":
    case "bar":
    case "street":
      return "lived_moments";
    case "pool":
    case "beach":
      return "lifestyle_travel";
    default:
      return "everyday_life";
  }
}

export interface RecoveryStoryCopy {
  ig_caption: string;
  hashtags: string[];
  hook_text: string | null;
  next_hint: string;
}

function safeJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  return JSON.parse(first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned);
}

/**
 * Writes the day's copy FOR the recovery scene, under the story engine's own rules.
 *
 * `previousCaptions` keeps the voice continuous with the days before it — a recovery reel is still
 * the same person on the same account, and a caption that reads like it came from a different
 * feed is its own kind of incoherence.
 */
export async function generateRecoveryStoryCopy(args: {
  day: StoryDerivableDay;
  scene: RecoveryStoryScene;
  characterName: string;
  previousCaptions: string[];
  nextDirection?: string | null;
}): Promise<RecoveryStoryCopy> {
  const { day, scene, characterName } = args;

  const system = `You write Instagram copy for ${characterName}, a lifestyle creator.

Today's scene is fixed and must not be reinterpreted:
Location: ${scene.location}
Full setting: ${day.brief.spatial_setup}
Wearing: ${day.brief.wardrobe_lock}
Light: ${day.brief.lighting_state}, ${day.brief.time_of_day.replace(/_/g, " ")}
What she does in the reel: ${day.compiled.action}
Tier: ${scene.tier}

${args.previousCaptions.length > 0 ? `Her last captions, for voice continuity — do NOT repeat their phrasing or their location:\n${args.previousCaptions.map((c) => `  - ${c}`).join("\n")}\n` : ""}
RULES — these are the same rules every other day on this account obeys:
${STORY_COPY_RULES}

HARD CONSTRAINTS:
- The caption must match THIS scene. She is not travelling today. Do not name a city, a hotel, a
  bar, a dock or any place that is not in the setting above.
- Hashtags must match this scene too. No location tags for places that are not in it.
- Write in HER OWN VOICE, first person. Never describe her from outside ("her eyes", "she smiles")
  — she is the one posting, not someone being photographed.
- She is on her own. Do not invent a companion: no "we", "us", "him", or a "her"/"she" that means
  somebody else. Anyone visible in the background is an anonymous stranger and is not addressed.
${args.nextDirection ? `- next_hint: one sentence pointing at tomorrow, which is: ${args.nextDirection}` : "- next_hint: one sentence pointing at tomorrow, kept vague."}

Return STRICT JSON only, no markdown:
{"ig_caption":"...","hashtags":["...10 items, no # prefix..."],"hook_text":"... or null","next_hint":"..."}`;

  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: "Write today's copy." }],
  });

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const parsed = safeJson(raw);

  const hashtags = Array.isArray(parsed.hashtags)
    ? (parsed.hashtags as unknown[]).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean)
    : [];
  if (typeof parsed.ig_caption !== "string" || !parsed.ig_caption.trim()) {
    throw new Error(`recovery copy: no ig_caption. Raw: ${raw.slice(0, 200)}`);
  }
  if (hashtags.length === 0) throw new Error(`recovery copy: no hashtags. Raw: ${raw.slice(0, 200)}`);

  const hook = typeof parsed.hook_text === "string" && parsed.hook_text.trim() ? parsed.hook_text.trim() : null;

  return {
    ig_caption: parsed.ig_caption.trim(),
    hashtags,
    hook_text: hook,
    next_hint: typeof parsed.next_hint === "string" ? parsed.next_hint.trim() : "",
  };
}

/**
 * Guard against copy that changes WHO is in the scene.
 *
 * Found on the first VHD dry run (2026-09-09): the wine-bar arm came back as "somewhere between
 * the first glass and deciding to stay for another. her eyes came back and so did mine." Two
 * defects in one sentence. It narrates Vivienne in the third person, which no caption on this
 * account has ever done — 25 consecutive captions are first-person singular or impersonal, and the
 * only "she" in them is the cat, who is in that day's pet_lock. And it invents a companion for a
 * brief whose visual rules say "one sharp face only" and "no foreground companion", so the caption
 * would have described a person the video is explicitly built not to contain.
 *
 * That is the same class of failure as a caption naming the wrong city — the copy contradicting
 * the video — which is why it gets the same treatment: a rule in the prompt AND a check that can
 * refuse the write, rather than a human noticing it once.
 *
 * `petInScene` allows she/her back in when the day's brief actually has an animal in it.
 * Returns the offending words; empty means coherent.
 */
export function findPersonLeaks(copy: RecoveryStoryCopy, opts: { petInScene?: boolean } = {}): string[] {
  const haystack = `${copy.ig_caption} ${copy.hook_text ?? ""}`.toLowerCase();
  // Two deliberate exclusions, both found by running this against 25 real captions rather than
  // against invented ones:
  //
  //   "you"/"your" — addressing the viewer is this account's standard sign-off ("here most days if
  //   this is your kind of morning") and is not a second person in the scene.
  //
  //   "they"/"them"/"their" — English uses these for inanimate plurals, and a real caption reads
  //   "didn't plan the flowers. they were just there". Flagging those would refuse to write a
  //   perfectly good day, which is a worse failure than missing the rarer "they left" meaning
  //   people: this guard blocks a write, so a false positive stalls the calendar.
  const THIRD_PERSON = opts.petInScene
    ? /\b(he|him|his|we|us|our|ours)\b/g
    : /\b(he|him|his|she|her|hers|we|us|our|ours)\b/g;
  const hits = haystack.match(THIRD_PERSON) ?? [];
  return Array.from(new Set(hits));
}

/**
 * Guard against the exact failure this module exists to fix: copy that names somewhere the scene
 * is not. Checked against the previous days' locations, which is where a stale caption would come
 * from. Returns the offending terms; empty means coherent.
 */
export function findLocationLeaks(copy: RecoveryStoryCopy, forbiddenPlaces: string[]): string[] {
  const haystack = `${copy.ig_caption} ${copy.hashtags.join(" ")} ${copy.hook_text ?? ""}`.toLowerCase();
  const leaks: string[] = [];
  for (const place of forbiddenPlaces) {
    const term = place.toLowerCase().trim();
    if (term.length < 4) continue;
    if (haystack.includes(term)) leaks.push(place);
  }
  return leaks;
}

// Per-date content overrides (controversy test + "tries everything once" series, 2026-10).
// Data-only control: chs_characters.feature_flags.reel_hook_overrides = {
//   "2026-10-20": { "hook_text": "...", "caption": "...", "tag": "controversy_v1" },
//   "2026-10-19": { "hook_text": "day 1: horse riding. never done this", "caption": "...", "tag": "tries_v1",
//                   "recipe": "tries_episode", "tier": "wellness_fitness",
//                   "location": "...", "episode_guidance": "..." } }
// Key = story date (chs_story_days.date). Absent key -> normal behaviour. isFlagOn() only reads
// `=== true` booleans, so this object never toggles a flag. Roll back = delete the key.
//   hook_text        reel overlay (still obeys the no-repeat guard); tagged overrides render with
//                    relaxed overlay limits (<= 9 words / 44 chars, same 2-line safe-zone layout)
//   caption          IG reel caption, verbatim (no share line appended)
//   tag              experiment tag -> chs_media.visual_signature.experiment (+ reel_recipe.experiment)
//   recipe           "tries_episode" forces the series reel recipe for the day
//   end_text         optional end-card line over the last ~1.5 s (lower third, emoji stripped)
//   tier/location/episode_guidance  steer the story day (story route) — all optional
import { isBannedHookText } from "@/lib/recovery/reelRecipes";

export interface ReelHookOverride {
  hook_text: string | null;
  caption?: string | null;
  tag?: string | null;
  recipe?: string | null;
  tier?: string | null;
  location?: string | null;
  episode_guidance?: string | null;
  /** Gerund phrase for the reel prompt ("throwing punches at a heavy bag"). */
  action?: string | null;
  /** Props explicitly allowed in her hands on this day (e.g. ["a jar of honey"]). Lifts the
   *  nothing-in-hands rule for THIS day only; everything else stays forbidden. */
  allowed_props?: string[] | null;
  /** Explicit hashtags for this day (without #) — replace the story's generated ones. */
  hashtags?: string[] | null;
  /** End-card line burned over the last ~1.5 s (same lower-third style); absent = no end card. */
  end_text?: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function reelHookOverrideFor(flags: unknown, date: string | null | undefined): ReelHookOverride | null {
  if (!date || !flags || typeof flags !== "object") return null;
  const map = (flags as Record<string, unknown>).reel_hook_overrides;
  if (!map || typeof map !== "object") return null;
  const o = (map as Record<string, unknown>)[date];
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  let hook = str(r.hook_text);
  if (hook && isBannedHookText(hook)) hook = null;
  const out: ReelHookOverride = {
    hook_text: hook,
    caption: str(r.caption),
    tag: str(r.tag),
    recipe: str(r.recipe),
    tier: str(r.tier),
    location: str(r.location),
    episode_guidance: str(r.episode_guidance),
    action: str(r.action),
    hashtags: Array.isArray(r.hashtags) ? (r.hashtags as unknown[]).map((x) => (typeof x === "string" ? x.trim().replace(/^#/, "") : "")).filter(Boolean) : null,
    allowed_props: Array.isArray(r.allowed_props) ? (r.allowed_props as unknown[]).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : null,
    end_text: str(r.end_text),
  };
  if (!out.hook_text && !out.caption && !out.tag && !out.episode_guidance) return null;
  return out;
}

/** Story-prompt block for a series episode day (empty when the override carries no guidance). */
export function episodeContextBlock(o: ReelHookOverride | null): string | undefined {
  if (!o?.episode_guidance) return undefined;
  const bindi = o.tag === "bindi_v1";
  return `SERIES EPISODE TODAY — ABSOLUTE PRIORITY (this scene's location, wardrobe, pose, props and light override the tier, any travel arc/trip/city, life state and every other block for THIS day; other context may only colour the mood, never change the place, outfit or props; voice doctrine, sacred details and SFW rules still apply):
${o.episode_guidance}
${o.location ? `- location MUST be exactly this place (you may add one concrete material/light detail): ${o.location}\n` : ""}${bindi ? "- a styled costume/wardrobe look exactly as the scene prompt describes (a deliberate costume is allowed today); slow, posed, sensual movement; face clearly visible and close to the lens, ending with eye contact into the camera." : "- the scene shows her ACTIVELY doing the activity (mid-movement, real effort), face clearly visible and close to the lens, ending with eye contact into the camera."}
${o.action ? `- the action on camera: ${o.action}.\n` : ""}${o.allowed_props?.length ? `- allowed in her hands today (list them in allowed_props; nothing else held): ${o.allowed_props.join(", ")}\n` : ""}- hair: her usual long loose dark waves, unless the wardrobe line above says it is tied for the activity.
- framing: her face in the upper-middle of the frame with a little headroom; keep the lower third clean.
${bindi ? "- sheer/translucent fabric is allowed, but nipples and genitals stay fully covered (opaque panels, folds, shadow or nude-tone underwear) - never explicit." : "- elegant, feminine and quietly sexy styling that CONTRASTS with the setting — never explicit, never a costume."}
- no other identifiable person in frame (an instructor may exist only off camera or as an out-of-focus hand/shoulder).
- hashtags: about this scene, outfit and mood only — never a city, hotel, trip or travel tag.
${o.hook_text ? `- hook_text: ${o.hook_text}\n` : ""}${o.caption ? `- ig_caption: ${o.caption.replace(/\n/g, " / ")}\n` : ""}`;
}

/** Travel/arc words that must never reach a series-scene day's hashtags. */
const TRAVEL_TAG = /(lisbon|lisboa|porto|paris|rome|roma|milan|london|barcelona|madrid|vienna|prague|bratislava|nyc|newyork|dubai|bali|hotel|travel|trip|vacation|wanderlust|citybreak|getaway)/i;

/**
 * Hashtags to store for a story day. Override hashtags win; on a scene day (location/guidance set)
 * travel-arc leftovers (city/hotel/trip tags) are dropped; other days unchanged.
 */
export function seriesHashtags(o: ReelHookOverride | null | undefined, generated: string[] | null | undefined): string[] | null | undefined {
  if (o?.hashtags?.length) return o.hashtags;
  if (!o || !(o.location || o.episode_guidance) || !Array.isArray(generated)) return generated;
  return generated.filter((t) => !TRAVEL_TAG.test(String(t)));
}

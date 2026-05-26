import { supabase } from "@/lib/supabase";

export type StoryTier =
  | "lifestyle_travel"
  | "intimate_aesthetic";

export type ContentPhaseKind =
  | "location_drop"
  | "golden_hour_moment"
  | "hotel_morning";

export interface ContentPhase {
  kind: ContentPhaseKind;
  detail?: string;
}

const AUTO_TIER_RATIO = { lifestyle_travel: 0.7, intimate_aesthetic: 0.3 };

// Phase 1 (days 1-30): pure lifestyle_travel only — establish location + aesthetic, build trust
// Phase 2+ (day 31+): intimate_aesthetic tier unlocked per ratio
const PHASE_1_LAST_DAY = 30;

export async function pickTier(characterId: string, lookbackDays = 10): Promise<StoryTier> {
  const { data: dayData } = await supabase
    .from("chs_story_days")
    .select("day_number")
    .eq("character_id", characterId)
    .order("day_number", { ascending: false })
    .limit(1);

  const latestDay = (dayData?.[0]?.day_number ?? 0) + 1;

  // Phase 1: travel only
  if (latestDay <= PHASE_1_LAST_DAY) return "lifestyle_travel";

  const { data } = await supabase
    .from("chs_story_days")
    .select("tier")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const autoTiers = (data ?? []).filter(
    (d) => d.tier === "lifestyle_travel" || d.tier === "intimate_aesthetic"
  );

  if (autoTiers.length < lookbackDays / 2) {
    return Math.random() < AUTO_TIER_RATIO.lifestyle_travel
      ? "lifestyle_travel"
      : "intimate_aesthetic";
  }

  const travelCount = autoTiers.filter((d) => d.tier === "lifestyle_travel").length;
  const travelRatio = travelCount / autoTiers.length;

  if (travelRatio < AUTO_TIER_RATIO.lifestyle_travel - 0.05) return "lifestyle_travel";
  if (travelRatio > AUTO_TIER_RATIO.lifestyle_travel + 0.1) return "intimate_aesthetic";

  return Math.random() < AUTO_TIER_RATIO.lifestyle_travel
    ? "lifestyle_travel"
    : "intimate_aesthetic";
}

// Repurposed as content phase signals — location drops and golden hour moments
export async function pickDriftSeeds(characterId: string, dayNumber: number, lookbackDays = 14): Promise<ContentPhase[]> {
  // Phase 1: no intimate drops, no teaser signals
  if (dayNumber <= PHASE_1_LAST_DAY) return [];

  const { data } = await supabase
    .from("chs_story_days")
    .select("drift_seeds")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const rows = (data ?? []) as Array<{ drift_seeds: ContentPhase[] | null }>;

  const countOf = (kind: ContentPhaseKind) =>
    rows.filter((r) => Array.isArray(r.drift_seeds) && r.drift_seeds.some((s) => s.kind === kind)).length;

  const phases: ContentPhase[] = [];

  // Location drop — "new city" signal, cluster at start of a location stay
  if (countOf("location_drop") === 0 && Math.random() < 0.15) {
    phases.push({ kind: "location_drop" });
  }

  // Golden hour moment — special lighting note for reel/carousel
  if (countOf("golden_hour_moment") === 0 && Math.random() < 0.12) {
    phases.push({ kind: "golden_hour_moment" });
  }

  // Hotel morning — intimate bedroom/suite layer (Phase 2+ only)
  if (countOf("hotel_morning") === 0 && Math.random() < 0.10) {
    phases.push({ kind: "hotel_morning" });
  }

  return phases;
}

export function tierGuidance(tier: StoryTier): string {
  if (tier === "lifestyle_travel") {
    return `TIER: lifestyle_travel (location-led, aspirational, golden-hour energy)

This is a travel day. The location is the story. She is passing through somewhere beautiful.

Scene must be:
- exterior or hotel terrace / balcony / rooftop — city or coast visible
- natural light: golden hour, blue hour, Mediterranean afternoon, morning haze
- one clear travel anchor: a city view, a coastline, cobblestones, a hotel pool edge, a café terrace
- her posture: relaxed, off-duty, mid-moment — not posed for camera

Narrative tone: present, warm, slightly candid. One sentence of location. One observation. End with a soft hook ("next stop:" / "the light here does something" / "checked in. do not disturb.").

Wardrobe: silk, linen, minimal gold jewelry. Light, effortless. Travel-editorial register.`;
  }

  if (tier === "intimate_aesthetic") {
    return `TIER: intimate_aesthetic (soft light, suite or bedroom, sensual but editorial)

This is a slow morning or late evening. She is in the room, not the city.

Scene must be:
- interior: hotel suite, bedroom with window light, bathroom vanity, balcony at golden hour from inside
- light: soft side-window, warm lamp, indirect — never harsh overhead
- one intimate anchor: silk robe, unmade bed (she is NOT in it — standing near it), mirror, morning coffee tray
- her posture: unhurried — stretching, reaching, looking out the window, adjusting a strap

Narrative tone: personal, close, slightly warm. Not explicit. Sensuality through light and fabric, not description.

SAFE FASHION RULES: editorial sensuality only. No explicit action, no pornographic framing. Lingerie/robe is acceptable as editorial fashion.`;
  }

  return "";
}

export function driftSeedGuidance(seeds: ContentPhase[]): string {
  if (seeds.length === 0) return "";

  const lines: string[] = [];
  for (const seed of seeds) {
    if (seed.kind === "location_drop") {
      lines.push(
        "- location_drop: Today is the first day in a new city. Narrative must name the city explicitly once. Tone is arrival energy — fresh, slightly disoriented in a good way."
      );
    } else if (seed.kind === "golden_hour_moment") {
      lines.push(
        "- golden_hour_moment: The scene peaks at golden hour. Mention the light quality once — warm, low, hitting the wall or her face — without using the phrase 'golden hour'. Scene brief lighting must reflect this."
      );
    } else if (seed.kind === "hotel_morning") {
      lines.push(
        "- hotel_morning: The scene is a suite morning before leaving — room service, light through curtains, unhurried. ig_caption should be intimate and personal (\"do not disturb\", \"last morning here\", \"room 214 had the best light\"). This is Fanvue-adjacent content."
      );
    }
  }

  return `CONTENT PHASE SIGNALS ACTIVE TODAY:
${lines.join("\n")}`;
}

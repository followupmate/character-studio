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

export async function pickTier(characterId: string, lookbackDays = 10): Promise<StoryTier> {
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

export async function pickDriftSeeds(characterId: string, _dayNumber: number, lookbackDays = 14): Promise<ContentPhase[]> {
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

  if (countOf("location_drop") === 0 && Math.random() < 0.15) {
    phases.push({ kind: "location_drop" });
  }

  if (countOf("golden_hour_moment") === 0 && Math.random() < 0.12) {
    phases.push({ kind: "golden_hour_moment" });
  }

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

Narrative tone: present, warm, slightly candid. Name the city. One sharp observation. End with a soft hook.

Wardrobe: silk slip dress, linen blazer, minimal gold jewelry. Light, effortless.`;
  }

  if (tier === "intimate_aesthetic") {
    return `TIER: intimate_aesthetic (body-confident, sensual, editorial provocation)

She is in the room. The city is outside. She is the subject.

Scene must be:
- interior: hotel suite or bedroom — window light, warm lamp, mirror, unmade bed as background texture
- light: soft directional side light that traces the body — window or single lamp, never flat
- wardrobe: silk robe open at the shoulder, lingerie as editorial fashion, thin strap falling, fabric against skin
- her posture: confident, aware of the frame — mid-stretch, one knee on the bed edge, standing at the mirror adjusting a strap, looking back over her shoulder

Narrative tone: direct, slightly daring, body-aware. She knows she looks good. The caption says it without saying it. Provocative but never crude — the provocation is in confidence, not in description.

ig_caption for this tier MUST have an edge: a knowing reference to the body, the room, the morning, the fabric. Not "the robe had nice light" — more like "the mirror in this room is doing something illegal" or "woke up like this. stayed like this." or "the robe doesn't stay on long here."

SAFE EDITORIAL RULES: Sensuality through posture, light, and fabric. Lingerie and partial exposure are acceptable. No explicit sexual acts, no pornographic framing.`;
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
        "- golden_hour_moment: The scene peaks at golden hour. Mention the light quality once — warm, low, hitting the wall or her face — without using the phrase 'golden hour'."
      );
    } else if (seed.kind === "hotel_morning") {
      lines.push(
        "- hotel_morning: The scene is a suite morning — room service tray, light through curtains, silk robe, unhurried. ig_caption must be intimate and slightly provocative (e.g. \"do not disturb\", \"the robe doesn't stay on long here\", \"room 214 had the best light and the worst checkout time\")."
      );
    }
  }

  return `CONTENT PHASE SIGNALS ACTIVE TODAY:
${lines.join("\n")}`;
}


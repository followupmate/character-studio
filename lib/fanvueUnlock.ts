import { supabase } from "@/lib/supabase";
import type { StoryTier } from "@/lib/storyTier";

// FANVUE LAYER (v1.1, flag: fanvue_drafts) — turn an IG scene into a monetization DRAFT (chs_fanvue_unlocks).
// Pure DB write, post-batch, NEVER auto-publishes and NEVER calls the Fanvue MCP. The draft proposes an
// intensity (soft/medium/strong) that the user approves later. IG stays public-safe; the stronger framing
// lives only on the draft row. The IG CTA is decoupled and rate-limited to ~25–35% of outputs.

interface TierRule {
  probability: number;
  intensity: "soft" | "medium" | "strong";
  unlock: "subscription" | "ppv" | "bundle";
  price: number;
  series: string[];
}

const FANVUE_RULES: Record<StoryTier, TierRule> = {
  intimate_aesthetic: { probability: 0.85, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Room 407", "After Hours", "Silk & Skin"] },
  luxe_car:           { probability: 0.80, intensity: "strong", unlock: "subscription", price: 9.99, series: ["Night Drive", "Passenger Princess", "After Dark"] },
  wellness_fitness:   { probability: 0.45, intensity: "medium", unlock: "subscription", price: 7.99, series: ["Body Diary", "Locker Room", "Post-Workout"] },
  lifestyle_travel:   { probability: 0.55, intensity: "medium", unlock: "ppv",          price: 8.99, series: ["Pool Heat", "Room with a View", "Beach Heat"] },
  everyday_life:      { probability: 0.25, intensity: "soft",   unlock: "subscription", price: 6.99, series: ["White Shirt Morning", "Soft Home", "Slow Sunday"] },
};

const IG_CTAS = ["the full set is inside", "the rest is on fanvue", "uncut version inside", "you only get the rest somewhere else"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// IG CTA budget: keep CTAs on ~25–35% of recent outputs. Uses recent drafts as the denominator proxy.
async function shouldAttachIgCta(characterId: string): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await supabase
    .from("chs_fanvue_unlocks")
    .select("ig_cta")
    .eq("character_id", characterId)
    .gte("created_at", since);
  const rows = data ?? [];
  if (rows.length < 4) return Math.random() < 0.30; // not enough history yet
  const withCta = rows.filter((r) => !!r.ig_cta).length;
  const ratio = withCta / rows.length;
  if (ratio < 0.25) return true;
  if (ratio > 0.35) return false;
  return Math.random() < 0.30;
}

interface StoryDayLike {
  tier: string | null;
  location: string | null;
  mood: string | null;
  ig_caption: string | null;
  hook_text: string | null;
}

export async function maybeCreateFanvueUnlock(args: {
  characterId: string;
  storyDayId: string;
  dailyPlanId: string;
  storyDay: StoryDayLike;
  sceneBriefJson: Record<string, unknown> | null;
}): Promise<{ created: boolean; id?: string }> {
  const tier = (args.storyDay.tier ?? "everyday_life") as StoryTier;
  const rule = FANVUE_RULES[tier] ?? FANVUE_RULES.everyday_life;

  // Don't create two drafts for the same day; tier-probability gate otherwise.
  const { data: existing } = await supabase
    .from("chs_fanvue_unlocks")
    .select("id")
    .eq("story_day_id", args.storyDayId)
    .limit(1);
  if (existing && existing.length > 0) return { created: false };
  if (Math.random() > rule.probability) return { created: false };

  const series = pick(rule.series);
  const descriptor = (args.storyDay.hook_text || args.storyDay.location || args.storyDay.mood || "the full set").toString().toLowerCase();
  const wardrobe = typeof args.sceneBriefJson?.wardrobe_lock === "string" ? (args.sceneBriefJson.wardrobe_lock as string) : "";

  const attachCta = await shouldAttachIgCta(args.characterId);

  const row = {
    character_id: args.characterId,
    story_day_id: args.storyDayId,
    daily_plan_id: args.dailyPlanId,
    unlock_type: rule.unlock,
    series_name: series,
    title: `${series} — ${descriptor}`.slice(0, 120),
    teaser_text: args.storyDay.hook_text || (args.storyDay.ig_caption ?? "").slice(0, 80) || descriptor,
    sales_copy: `Today's ${tier.replace("_", " ")} moment, the version Instagram won't let her post. ${series} — full set inside.`,
    suggested_price: rule.price,
    intensity: rule.intensity, // PROPOSED — user approves/edits before use
    ig_cta: attachCta ? pick(IG_CTAS) : null,
    fanvue_prompt: `Soul set for "${series}". Same scene as today (${args.storyDay.location ?? "scene"}). ${wardrobe ? `Wardrobe: ${wardrobe}. ` : ""}Intensity ${rule.intensity} — within Fanvue's tasteful adult range, no explicit unless approved. Keep faithful Vivienne identity.`,
    status: "draft" as const,
  };

  const { data, error } = await supabase.from("chs_fanvue_unlocks").insert(row).select("id").single();
  if (error) return { created: false };
  return { created: true, id: data.id as string };
}

import { supabase } from "@/lib/supabase";
import type { StoryTier, MagnetismLevel } from "@/lib/storyTier";
import { livedMomentsFanvueProbability } from "@/lib/storyTier";
import type { SensualVisualLanguage, SexAppealStyle, LuxurySeduction, GenerativeSituation } from "@/lib/situationPlanner";
import type { PlayfulHotWorldProfile } from "@/lib/playfulHotWorldConfig";
import {
  FANVUE_RULES,
  situationTensionClause,
  sensualVisualLanguageClause,
  sexAppealStyleClause,
  luxurySeductionClause,
  playfulHotWorldClause,
} from "@/lib/fanvuePrimitives";
import type { TierRule, StoryDayLike, SituationFanvueTension } from "@/lib/fanvuePrimitives";
import { buildFanvueContinuationPlan } from "@/lib/fanvueContinuation";

// FANVUE LAYER (v1.1, flag: fanvue_drafts) — turn an IG scene into a monetization DRAFT (chs_fanvue_unlocks).
// Pure DB write, post-batch, NEVER auto-publishes and NEVER calls the Fanvue MCP. The draft proposes an
// intensity (soft/medium/strong) that the user approves later. IG stays public-safe; the stronger framing
// lives only on the draft row. No IG caption CTA is generated (ig_cta stays null) as of phase 1.
//
// fanvue_paid_continuation_v1 (flag, requires fanvue_drafts): when on, maybeCreateFanvueUnlock writes
// a structured continuation_plan (source tease/paid promise/content level/6-shot arc, see
// lib/fanvueContinuation.ts) instead of a flat fanvue_prompt. Flag off = byte-identical legacy row —
// see lib/fanvueUnlock.test.ts and lib/fanvueContinuation.test.ts.

// Re-exported so every existing `import { X } from "@/lib/fanvueUnlock"` call site (including
// lib/fanvueUnlock.test.ts) keeps working unchanged after these moved to lib/fanvuePrimitives.ts.
export type { TierRule, StoryDayLike, SituationFanvueTension };
export {
  FANVUE_RULES,
  situationTensionClause,
  sensualVisualLanguageClause,
  sexAppealStyleClause,
  luxurySeductionClause,
  playfulHotWorldClause,
};

// IG CTA removed (phase 1, 2026-10): the public Instagram caption never carries a Fanvue / link-in-bio /
// "somewhere else" line any more — the funnel lives in the bio link only. The ig_cta column on
// chs_fanvue_unlocks is kept (always null for new drafts) so the DB schema and the /fanvue UI are
// unchanged; app/api/publish/from-batch/route.ts no longer reads it.

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export function buildFanvuePrompt(
  series: string,
  storyDay: StoryDayLike,
  wardrobe: string,
  intensity: "soft" | "medium" | "strong",
  situationTension?: SituationFanvueTension,
  sensualVisualLanguage?: SensualVisualLanguage,
  sexAppealStyle?: SexAppealStyle,
  luxurySeduction?: LuxurySeduction,
  playfulHotWorld?: PlayfulHotWorldProfile
): string {
  const situationClause = situationTensionClause(situationTension);
  const sensualClause = sensualVisualLanguageClause(sensualVisualLanguage);
  const sexAppealClause = sexAppealStyleClause(sexAppealStyle);
  const luxuryClause = luxurySeductionClause(luxurySeduction);
  const playfulClause = playfulHotWorldClause(playfulHotWorld);
  return `Soul set for "${series}". Continue the SAME real moment as today (${storyDay.location ?? "scene"}${storyDay.moment_family ? `, ${storyDay.moment_family}` : ""}) — a more private/relaxed continuation of it, NOT a new lingerie/bedroom set.${situationClause}${sensualClause}${sexAppealClause}${luxuryClause}${playfulClause} ${wardrobe ? `Wardrobe: ${wardrobe}. ` : ""}Intensity ${intensity} — within Fanvue's tasteful adult range, no explicit unless approved. Keep faithful Vivienne identity.`;
}

export async function maybeCreateFanvueUnlock(args: {
  characterId: string;
  storyDayId: string;
  dailyPlanId: string;
  storyDay: StoryDayLike;
  sceneBriefJson: Record<string, unknown> | null;
  situationFanvueTension?: SituationFanvueTension;
  sensualVisualLanguage?: SensualVisualLanguage;
  sexAppealStyle?: SexAppealStyle;
  luxurySeduction?: LuxurySeduction;
  playfulHotWorld?: PlayfulHotWorldProfile;
  // fanvue_paid_continuation_v1 flag state — defaults to off (legacy row shape). Never flips
  // content_level to explicit_adult on its own; defaultContentLevel() inside
  // buildFanvueContinuationPlan can only produce premium_sensual/erotic_tease automatically.
  pipelineV1?: boolean;
  // validateFanvueSource() inputs (item 0) — the full source situation and whether it passed
  // validation. Only meaningful/consumed when pipelineV1 is true; forwarded verbatim into
  // buildFanvueContinuationPlan, which is undefined-safe (missing situation = conservative,
  // blocks-for-intimate_aesthetic direction, never a silent bypass).
  situation?: GenerativeSituation | null;
  situationValidated?: boolean;
}): Promise<{ created: boolean; id?: string }> {
  const tier = (args.storyDay.tier ?? "everyday_life") as StoryTier;
  const rule = FANVUE_RULES[tier] ?? FANVUE_RULES.everyday_life!;

  // lived_moments modulates its Fanvue probability by the day's magnetism level
  // (soft .30 → sensual .95; ≈0.4925 average, 0.50 fallback for old null rows).
  // Its draft intensity follows too. Unchanged by pipelineV1 — tier weights don't change.
  const magnetism = (args.storyDay.magnetism_level ?? null) as MagnetismLevel | null;
  const probability =
    tier === "lived_moments"
      ? livedMomentsFanvueProbability(magnetism)
      : rule.probability;
  const intensity: TierRule["intensity"] =
    tier === "lived_moments"
      ? (magnetism === "sensual" ? "strong" : magnetism === "flirty" ? "medium" : "soft")
      : rule.intensity;

  // Don't create two drafts for the same day; probability gate otherwise.
  const { data: existing } = await supabase
    .from("chs_fanvue_unlocks")
    .select("id")
    .eq("story_day_id", args.storyDayId)
    .limit(1);
  if (existing && existing.length > 0) return { created: false };
  if (Math.random() > probability) return { created: false };

  const series = pick(rule.series);
  const descriptor = (args.storyDay.hook_text || args.storyDay.location || args.storyDay.mood || "the full set").toString().toLowerCase();
  const wardrobe = typeof args.sceneBriefJson?.wardrobe_lock === "string" ? (args.sceneBriefJson.wardrobe_lock as string) : "";

  const ig_cta: string | null = null;

  if (args.pipelineV1) {
    const plan = buildFanvueContinuationPlan({
      tier,
      series,
      storyDay: args.storyDay,
      wardrobe,
      magnetism,
      situationTension: args.situationFanvueTension,
      sensualVisualLanguage: args.sensualVisualLanguage,
      sexAppealStyle: args.sexAppealStyle,
      luxurySeduction: args.luxurySeduction,
      playfulHotWorld: args.playfulHotWorld,
      situation: args.situation,
      situationValidated: args.situationValidated,
    });
    const row = {
      character_id: args.characterId,
      story_day_id: args.storyDayId,
      daily_plan_id: args.dailyPlanId,
      unlock_type: plan.commercial.mode,
      series_name: series,
      title: `${series} — ${descriptor}`.slice(0, 120),
      teaser_text: args.storyDay.hook_text || (args.storyDay.ig_caption ?? "").slice(0, 80) || descriptor,
      sales_copy: plan.paid_promise,
      suggested_price: plan.commercial.price_eur,
      intensity: plan.content_level === "premium_sensual" ? "medium" : "strong",
      ig_cta,
      fanvue_prompt: null,
      content_level: plan.content_level,
      continuation_plan: plan,
      pipeline_version: "paid_continuation_v1" as const,
      status: "draft" as const,
    };
    const { data, error } = await supabase.from("chs_fanvue_unlocks").insert(row).select("id").single();
    if (error) return { created: false };
    return { created: true, id: data.id as string };
  }

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
    intensity, // PROPOSED — user approves/edits before use
    ig_cta,
    fanvue_prompt: buildFanvuePrompt(series, args.storyDay, wardrobe, intensity, args.situationFanvueTension, args.sensualVisualLanguage, args.sexAppealStyle, args.luxurySeduction, args.playfulHotWorld),
    pipeline_version: "legacy" as const,
    status: "draft" as const,
  };

  const { data, error } = await supabase.from("chs_fanvue_unlocks").insert(row).select("id").single();
  if (error) return { created: false };
  return { created: true, id: data.id as string };
}

import { supabase } from "@/lib/supabase";
import type { ContentPattern, MotionPattern, MotionRecommendation } from "./types";

// Motion Intelligence (D) — sub-layer, not the point of the system. Ported from the Dynamic
// Motion Library in lib/creative_intelligence.py (kept: the 3 seed patterns' exact kling_prompt
// text, and the 4 mutation strategies). Dropped: the fake
// `success_rate = avg_watch_time / 20.0` formula and flat-file persistence (data/motion_library.json)
// — patterns now live in chs_ci_motion_patterns, and performance is only ever populated once a
// generated video's motion pattern can be traced back to a real, scored IG post (that linkage
// does not exist in production yet — see NOTE below — so performance stays null/empty honestly
// instead of being invented).

export const SEED_MOTION_PATTERNS: MotionPattern[] = [
  {
    id: "cinematic_glide_v1",
    name: "The Cinematic Glide",
    description: "Smooth push-in with subtle rotation, cinematic timing.",
    kling_prompt:
      "smooth camera push-in movement, head follows camera trajectory, subtle 15-degree rotation, duration 8 seconds, cinematic timing",
    duration_sec: 8,
    origin: "seed",
    paired_content_pattern_ids: [],
  },
  {
    id: "natural_glance_v1",
    name: "The Natural Glance",
    description: "Subtle, broad-appeal default: blink, soft smile, gentle hair movement.",
    kling_prompt:
      "natural eye movement with blink, soft smile formation, hair movement suggesting gentle wind, head tilt 5 degrees, very subtle, duration 6 seconds",
    duration_sec: 6,
    origin: "seed",
    paired_content_pattern_ids: [],
  },
  {
    id: "editorial_walk_v1",
    name: "The Editorial Walk",
    description: "Confident walk toward camera, editorial pacing, sustained eye contact.",
    kling_prompt:
      "confident walking motion toward camera, gradual increase in scale, shoulder movement with gait, maintain eye contact, editorial pacing, duration 10 seconds",
    duration_sec: 10,
    origin: "seed",
    paired_content_pattern_ids: [],
  },
];

interface MotionPatternRow {
  id: string;
  name: string;
  description: string;
  kling_prompt: string;
  duration_sec: number;
  origin: "seed" | "evolution";
  parent_pattern_id: string | null;
  mutation_strategy: MotionPattern["mutation_strategy"] | null;
  paired_content_pattern_ids: string[] | null;
}

function rowToPattern(row: MotionPatternRow): MotionPattern {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kling_prompt: row.kling_prompt,
    duration_sec: row.duration_sec,
    origin: row.origin,
    parent_pattern_id: row.parent_pattern_id ?? undefined,
    mutation_strategy: row.mutation_strategy ?? undefined,
    paired_content_pattern_ids: row.paired_content_pattern_ids ?? [],
  };
}

// Idempotent — safe to call on every cron run. Only inserts the 3 seeds if the table is empty
// so hand-authored evolutions already stored aren't clobbered.
export async function ensureSeedMotionPatterns(): Promise<void> {
  const { count } = await supabase.from("chs_ci_motion_patterns").select("id", { count: "exact", head: true });
  if (count && count > 0) return;
  const { error } = await supabase.from("chs_ci_motion_patterns").insert(
    SEED_MOTION_PATTERNS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      kling_prompt: p.kling_prompt,
      duration_sec: p.duration_sec,
      origin: p.origin,
      paired_content_pattern_ids: [],
    }))
  );
  if (error) throw new Error(`ensureSeedMotionPatterns: ${error.message}`);
}

export async function getMotionPatterns(): Promise<MotionPattern[]> {
  const { data, error } = await supabase.from("chs_ci_motion_patterns").select("*");
  if (error) throw new Error(`getMotionPatterns: ${error.message}`);
  return (data as MotionPatternRow[]).map(rowToPattern);
}

// The 4 mutation strategies from Python's MotionEvolution.mutate_pattern, ported 1:1 in intent.
type MutationStrategy = "speed" | "intensity" | "timing" | "emphasis";
const MUTATION_STRATEGIES: MutationStrategy[] = ["speed", "intensity", "timing", "emphasis"];

function applySpeedVariation(prompt: string): string {
  if (prompt.includes("gradual")) return prompt.replace("gradual", "quick");
  if (prompt.includes("smooth")) return prompt.replace("smooth", "brisk");
  return `${prompt}, slightly faster pacing`;
}

function applyIntensityVariation(prompt: string): string {
  if (prompt.includes("subtle")) return prompt.replace("subtle", "pronounced");
  if (prompt.includes("pronounced")) return prompt.replace("pronounced", "subtle");
  return `${prompt}, more pronounced motion`;
}

function applyTimingVariation(prompt: string, durationSec: number): { prompt: string; durationSec: number } {
  const delta = Math.random() < 0.5 ? -1 : 1;
  const newDuration = Math.max(3, Math.min(15, Math.round(durationSec * (1 + delta * 0.1))));
  const newPrompt = prompt.replace(/duration \d+ seconds/, `duration ${newDuration} seconds`);
  return { prompt: newPrompt, durationSec: newDuration };
}

function applyEmphasisShift(prompt: string): string {
  if (prompt.includes("eye movement")) return prompt.replace("eye movement", "head movement");
  if (prompt.includes("head movement")) return prompt.replace("head movement", "body movement");
  if (prompt.includes("head tilt")) return prompt.replace("head tilt", "shoulder tilt");
  return prompt;
}

// Produces a new, not-yet-persisted MotionPattern by mutating one dimension of an existing
// one. Caller is responsible for persisting (insert into chs_ci_motion_patterns) if it wants
// to keep it — this function has no side effects.
export function mutateMotionPattern(base: MotionPattern, strategy?: MutationStrategy): MotionPattern {
  const chosen = strategy ?? MUTATION_STRATEGIES[Math.floor(Math.random() * MUTATION_STRATEGIES.length)];
  let kling_prompt = base.kling_prompt;
  let duration_sec = base.duration_sec;

  switch (chosen) {
    case "speed":
      kling_prompt = applySpeedVariation(kling_prompt);
      break;
    case "intensity":
      kling_prompt = applyIntensityVariation(kling_prompt);
      break;
    case "timing": {
      const result = applyTimingVariation(kling_prompt, duration_sec);
      kling_prompt = result.prompt;
      duration_sec = result.durationSec;
      break;
    }
    case "emphasis":
      kling_prompt = applyEmphasisShift(kling_prompt);
      break;
  }

  return {
    id: `${base.id}_mut_${Date.now().toString(36)}`,
    name: `${base.name} (${chosen} variant)`,
    description: `${base.description} — ${chosen} mutation of ${base.id}.`,
    kling_prompt,
    duration_sec,
    origin: "evolution",
    parent_pattern_id: base.id,
    mutation_strategy: chosen,
    paired_content_pattern_ids: [],
  };
}

// NOTE (integration gap, intentional for this phase): generated media does not yet record
// which MotionPattern.id produced it, so paired_content_pattern_ids / performance can't be
// populated from real data today. recommendMotion() is honest about this — it returns the
// safe, broad-appeal default (natural_glance) with an explicit "no pairing data yet" reason
// rather than inventing a preference. Once media generation records motion_pattern_id
// (the prepared integration point — see strategyGenerator.ts), correlateMotionWithContent
// becomes able to actually rank patterns per content pattern.
// Motion technique (camera movement, timing) primarily affects on-platform viewing behavior —
// not Fanvue conversion directly — so pairing is ranked by platform_composite_index, never the
// business axis. This mirrors scoring.ts's platform/business split: motion is a platform-side
// concern, and mixing in Fanvue clicks here would misattribute a business-conversion win to a
// motion choice that had nothing to do with it.
export function recommendMotion(contentPattern: ContentPattern, motionPatterns: MotionPattern[]): MotionRecommendation | null {
  const paired = motionPatterns
    .filter(
      (m) =>
        m.paired_content_pattern_ids.includes(contentPattern.id) &&
        m.performance &&
        m.performance.sample_size > 0 &&
        m.performance.platform_composite_index !== null
    )
    .sort((a, b) => (b.performance?.platform_composite_index ?? 0) - (a.performance?.platform_composite_index ?? 0));

  if (paired.length > 0) {
    const best = paired[0];
    return {
      motion_pattern_id: best.id,
      status: "paired",
      reason: `Paired with this content pattern in ${best.performance?.sample_size} prior post(s), platform composite index ${best.performance?.platform_composite_index?.toFixed(2)}x baseline.`,
      confidence_score: Math.min(1, (best.performance?.sample_size ?? 0) / 6),
    };
  }

  const fallback = motionPatterns.find((m) => m.id === "natural_glance_v1") ?? motionPatterns[0];
  if (!fallback) return null;
  return {
    motion_pattern_id: fallback.id,
    status: "fallback_unproven",
    reason: "No motion/content pairing data exists yet for this content pattern — defaulting to the broadest-appeal seed pattern, not a preference.",
    confidence_score: 0,
  };
}

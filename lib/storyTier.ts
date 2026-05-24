import { supabase } from "@/lib/supabase";

export type StoryTier =
  | "grounded_routine"
  | "cinematic_melancholy"
  | "incidental_wrongness"
  | "entropy";

export type DriftSeedKind =
  | "recurring_stranger"
  | "timestamp_mismatch"
  | "impossible_weather_memory";

export interface DriftSeed {
  kind: DriftSeedKind;
  detail?: string;
}

const AUTO_TIER_RATIO = { grounded_routine: 0.8, cinematic_melancholy: 0.2 };

export async function pickTier(characterId: string, lookbackDays = 10): Promise<StoryTier> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("tier")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const autoTiers = (data ?? []).filter(
    (d) => d.tier === "grounded_routine" || d.tier === "cinematic_melancholy"
  );

  if (autoTiers.length < lookbackDays / 2) {
    return Math.random() < AUTO_TIER_RATIO.grounded_routine
      ? "grounded_routine"
      : "cinematic_melancholy";
  }

  const groundedCount = autoTiers.filter((d) => d.tier === "grounded_routine").length;
  const groundedRatio = groundedCount / autoTiers.length;

  if (groundedRatio < AUTO_TIER_RATIO.grounded_routine - 0.05) return "grounded_routine";
  if (groundedRatio > AUTO_TIER_RATIO.grounded_routine + 0.1) return "cinematic_melancholy";

  return Math.random() < AUTO_TIER_RATIO.grounded_routine
    ? "grounded_routine"
    : "cinematic_melancholy";
}

const MISMATCH_HOURS = ["04:17", "03:09", "01:42", "23:56", "00:13", "02:48"];

export async function pickDriftSeeds(characterId: string, lookbackDays = 14): Promise<DriftSeed[]> {
  const { data } = await supabase
    .from("chs_story_days")
    .select("drift_seeds")
    .eq("character_id", characterId)
    .order("date", { ascending: false })
    .limit(lookbackDays);

  const rows = (data ?? []) as Array<{ drift_seeds: DriftSeed[] | null }>;

  const countOf = (kind: DriftSeedKind) =>
    rows.filter((r) => Array.isArray(r.drift_seeds) && r.drift_seeds.some((s) => s.kind === kind)).length;

  const seeds: DriftSeed[] = [];

  // Marseille Stranger — asymmetric: cluster after first appearance, hard gap after 3 in 14 days
  const strangerCount = countOf("recurring_stranger");
  const lastDayHadStranger =
    Array.isArray(rows[0]?.drift_seeds) &&
    rows[0].drift_seeds.some((s) => s.kind === "recurring_stranger");

  let strangerProb = 0.12;
  if (strangerCount === 0) strangerProb = 0.10;
  else if (strangerCount === 1) strangerProb = lastDayHadStranger ? 0.28 : 0.18;
  else if (strangerCount === 2) strangerProb = lastDayHadStranger ? 0.15 : 0.06;
  else strangerProb = 0;

  if (Math.random() < strangerProb) {
    seeds.push({ kind: "recurring_stranger" });
  }

  // Timestamp mismatch — independent, rare
  if (countOf("timestamp_mismatch") === 0 && Math.random() < 0.10) {
    seeds.push({
      kind: "timestamp_mismatch",
      detail: MISMATCH_HOURS[Math.floor(Math.random() * MISMATCH_HOURS.length)],
    });
  }

  // Impossible weather memory — independent, rare
  if (countOf("impossible_weather_memory") === 0 && Math.random() < 0.08) {
    seeds.push({ kind: "impossible_weather_memory" });
  }

  return seeds;
}

export function tierGuidance(tier: StoryTier): string {
  if (tier === "grounded_routine") {
    return `TIER: grounded_routine (mundane, repeating, non-event)

This is an ordinary day. No drama. No atmospheric epiphany.

Scene must be:
- one mundane physical action: buying, waiting, paying, descending stairs, riding an escalator
- environment: convenience store, station platform, market stall, bus, underpass, escalator
- daylight or fluorescent or harsh — never golden hour, never artful dusk
- one small repeating gesture (peeling, holding a token, counting coins, holding a ticket)

Narrative tone: flat observation. No metaphor. No mood adjective unless neutral ("cold", "warm", "loud", "quiet"). Avoid any phrasing that frames the moment as significant.

Wardrobe: same coat, same bag. No "outfit" register.`;
  }
  if (tier === "cinematic_melancholy") {
    return `TIER: cinematic_melancholy (liminal, displaced, quiet)

This is a quiet displaced day. Wong Kar-Wai grading and pacing, not Vogue.

Scene must be:
- liminal space: empty station, harbour at dusk, underground passage, hotel corridor, after-hours convenience store
- artificial light or low natural light (sodium, fluorescent, blue hour) — never high noon
- one moment of pause that lasts a beat too long
- the world is between rushes; no crowd

Narrative tone: observational, with one disorienting detail that is never explained.

Wardrobe: same coat, slight asymmetry — collar half-up, one cuff folded back.`;
  }
  return "";
}

export function driftSeedGuidance(seeds: DriftSeed[]): string {
  if (seeds.length === 0) return "";

  const lines: string[] = [];
  for (const seed of seeds) {
    if (seed.kind === "recurring_stranger") {
      lines.push(
        "- recurring_stranger: A motionless background silhouette in a long charcoal coat appears in this scene. Mention it in exactly one sentence inside narrative. Do NOT describe him as a character. Do not assign him intent. He is environmental geometry."
      );
    } else if (seed.kind === "timestamp_mismatch") {
      lines.push(
        `- timestamp_mismatch: The ig_caption must include the time "${seed.detail ?? "04:17"}" verbatim, while the scene takes place in clear daylight or evident afternoon. Do NOT reconcile the contradiction. The mismatch IS the post.`
      );
    } else if (seed.kind === "impossible_weather_memory") {
      lines.push(
        "- impossible_weather_memory: Narrative contains one passing reference to rain that did not happen — e.g. 'yesterday's rain still on the asphalt' — while every other detail confirms days of dry weather. Do not flag it. Do not justify it."
      );
    }
  }

  return `DRIFT SEEDS ACTIVE TODAY (treat as physical reality of the day, do NOT resolve the contradictions):
${lines.join("\n")}

These are not poetic devices. They are continuity errors. Write them flat, without commentary, exactly once.`;
}

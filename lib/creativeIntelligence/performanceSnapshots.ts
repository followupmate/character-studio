import { supabase } from "@/lib/supabase";

// Performance snapshot timing — WHEN a post's cumulative engagement gets frozen into an
// immutable checkpoint. Called from app/api/publish/import-insights/route.ts right after that
// route merges fresh engagement into chs_posts, so a snapshot always reflects real, just-fetched
// numbers. Never called anywhere else — this file owns no other write path.

export type Horizon = "24h" | "72h" | "7d";

// Per-horizon grace: how late a "first available import after the horizon" is still allowed to
// be before that horizon is simply never captured for this post. Deliberately TIGHT — with an
// hourly import-insights cadence, there is no good reason a post should ever be caught 40h late
// for its 24h checkpoint; a grace window that wide would risk labeling a near-72h cumulative
// value "24h data". Past grace, the horizon is skipped outright (never backdated) — the
// evaluator already treats a missing snapshot as insufficient_data, which is the honest outcome.
// This is also what makes the one-time backfill (see the backfill route) safe to build on the
// exact same function: an old post whose 24h mark is long gone simply never gets a 24h row,
// while a horizon still inside its grace window is captured for real.
export const SNAPSHOT_HORIZONS: Array<{ horizon: Horizon; minAgeHours: number; graceHours: number }> = [
  { horizon: "24h", minAgeHours: 24, graceHours: 6 },
  { horizon: "72h", minAgeHours: 72, graceHours: 12 },
  { horizon: "7d", minAgeHours: 24 * 7, graceHours: 24 },
];

export interface SnapshotMetricsInput {
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  total_interactions?: number;
  avg_watch_time_sec?: number;
  follows?: number;
  profile_visits?: number;
  fanvue_clicks?: number;
}

export function computeAgeHours(postedAt: string, now: Date): number {
  return (now.getTime() - new Date(postedAt).getTime()) / 3_600_000;
}

// Pure — which horizons are due to be captured right now, given this post's real age and which
// horizons it already has a snapshot for. Unit tested directly (no Supabase needed): this is the
// entire "24h only once / not before 72h / stale first-import never backdated" contract.
export function horizonsToCapture(ageHours: number, alreadyCaptured: ReadonlySet<Horizon>): Array<{ horizon: Horizon; ageHours: number }> {
  const due: Array<{ horizon: Horizon; ageHours: number }> = [];
  for (const { horizon, minAgeHours, graceHours } of SNAPSHOT_HORIZONS) {
    if (alreadyCaptured.has(horizon)) continue;
    if (ageHours < minAgeHours) continue;
    if (ageHours > minAgeHours + graceHours) continue;
    due.push({ horizon, ageHours: Math.round(ageHours * 100) / 100 });
  }
  return due;
}

function metricRow(params: {
  postId: string;
  characterId: string;
  horizon: Horizon | "current_observation";
  ageHours: number;
  postType: string;
  metrics: SnapshotMetricsInput;
  growthScore: number | null;
}) {
  const m = params.metrics;
  return {
    post_id: params.postId,
    character_id: params.characterId,
    horizon: params.horizon,
    age_hours: params.ageHours,
    post_type: params.postType,
    // Missing != 0: a key absent from the merged engagement object (never fetched / not
    // returned for this media type) stays NULL here, exactly as it was undefined upstream.
    views: m.views ?? null,
    reach: m.reach ?? null,
    likes: m.likes ?? null,
    comments: m.comments ?? null,
    saves: m.saves ?? null,
    shares: m.shares ?? null,
    total_interactions: m.total_interactions ?? null,
    avg_watch_time_sec: m.avg_watch_time_sec ?? null,
    follows: m.follows ?? null,
    profile_visits: m.profile_visits ?? null,
    fanvue_clicks: m.fanvue_clicks ?? null,
    growth_score: params.growthScore,
  };
}

// Called once per post per import-insights batch iteration, right after that post's engagement
// was successfully merged and written. Cheap: at most 3 small upserts, only for horizons that
// are actually newly due (usually 0 or 1 in steady state) — this is why the batched cron stays
// well under cron-job.org's 30s budget even with snapshotting added.
//
// ON CONFLICT (post_id, horizon) DO NOTHING (via ignoreDuplicates) is what makes the snapshot
// truly immutable: even a concurrent/duplicate cron run can never overwrite an existing
// checkpoint, no separate existence check required.
export async function captureMaturedSnapshots(params: {
  postId: string;
  characterId: string;
  postedAt: string;
  postType: string;
  metrics: SnapshotMetricsInput;
  growthScore: number | null;
  now?: Date;
}): Promise<Array<{ horizon: Horizon; ageHours: number }>> {
  const now = params.now ?? new Date();
  const ageHours = computeAgeHours(params.postedAt, now);

  const { data: existing } = await supabase
    .from("chs_post_performance_snapshots")
    .select("horizon")
    .eq("post_id", params.postId)
    .in("horizon", ["24h", "72h", "7d"]);
  const alreadyCaptured = new Set((existing ?? []).map((r) => r.horizon as Horizon));

  const due = horizonsToCapture(ageHours, alreadyCaptured);
  if (due.length === 0) return [];

  const rows = due.map((d) =>
    metricRow({
      postId: params.postId,
      characterId: params.characterId,
      horizon: d.horizon,
      ageHours: d.ageHours,
      postType: params.postType,
      metrics: params.metrics,
      growthScore: params.growthScore,
    })
  );

  const { error } = await supabase
    .from("chs_post_performance_snapshots")
    .upsert(rows, { onConflict: "post_id,horizon", ignoreDuplicates: true });
  if (error) {
    console.error("[performanceSnapshots] capture failed:", error.message);
    return [];
  }
  return due;
}

// One-time backfill helper (see the backfill route) — always writes a diagnostic
// 'current_observation' row with today's cumulative value, unconditionally (no grace check,
// since it never claims to be a real horizon checkpoint). Safe to call repeatedly: upsert with
// ignoreDuplicates:false here is intentional — 'current_observation' is explicitly allowed to
// refresh (it's a live diagnostic snapshot of "what we know right now", not an immutable
// checkpoint), unlike the three real horizons above.
export async function captureCurrentObservation(params: {
  postId: string;
  characterId: string;
  postType: string;
  metrics: SnapshotMetricsInput;
  growthScore: number | null;
  ageHours: number;
}): Promise<void> {
  const row = metricRow({
    postId: params.postId,
    characterId: params.characterId,
    horizon: "current_observation",
    ageHours: Math.round(params.ageHours * 100) / 100,
    postType: params.postType,
    metrics: params.metrics,
    growthScore: params.growthScore,
  });
  const { error } = await supabase
    .from("chs_post_performance_snapshots")
    .upsert(row, { onConflict: "post_id,horizon" });
  if (error) console.error("[performanceSnapshots] current_observation upsert failed:", error.message);
}

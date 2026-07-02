import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateGrowthScore, GrowthMetrics } from "@/lib/growthScore";

export const runtime = "nodejs";
export const maxDuration = 120;

// AUTO GROWTH LOOP — closes the feedback loop the engine was missing.
// Pulls Instagram insights for recently published posts via the SAME Graph API
// token the publish pipeline already uses, merges them into chs_posts.engagement,
// recomputes growth_score + growth_winner (top ~30%). Runs daily from vercel.json
// cron; manual fields imported via /api/characters/import-metrics (fanvue_clicks…)
// are preserved by the merge.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

// Metric sets from richest to safest — profile_visits/follows aren't available on
// every media type, and an unsupported metric fails the whole call, so we walk down.
const METRIC_SETS = [
  "views,reach,likes,comments,saved,shares,profile_visits,follows",
  "views,reach,likes,comments,saved,shares",
  "reach,likes,comments,saved,shares",
];

interface IgInsightsResponse {
  data?: Array<{ name: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }>;
  error?: { message?: string };
}

async function fetchInsights(mediaId: string, token: string): Promise<{ metrics: GrowthMetrics | null; error?: string }> {
  let lastError = "";
  for (const metricSet of METRIC_SETS) {
    const res = await fetch(
      `https://graph.instagram.com/v23.0/${mediaId}/insights?metric=${metricSet}&access_token=${token}`
    );
    const data = (await res.json().catch(() => ({}))) as IgInsightsResponse;
    if (res.ok && Array.isArray(data.data)) {
      const raw: Record<string, number> = {};
      for (const m of data.data) {
        raw[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0) || 0;
      }
      return {
        metrics: {
          views: raw.views,
          reach: raw.reach,
          likes: raw.likes,
          comments: raw.comments,
          saves: raw.saved,
          shares: raw.shares,
          profile_visits: raw.profile_visits,
          follows: raw.follows,
        },
      };
    }
    lastError = data.error?.message ?? `HTTP ${res.status}`;
    // Unsupported-metric error → try the next (smaller) set; other errors too, it's cheap.
  }
  return { metrics: null, error: lastError };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "IG_ACCESS_TOKEN not configured" }, { status: 500 });

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days")) || 7, 30);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Stories expire after 24h and expose almost no insights — skip them.
  const { data: posts, error } = await supabase
    .from("chs_posts")
    .select("id, character_id, platform_post_id, post_type, engagement")
    .eq("status", "posted")
    .eq("platform", "instagram")
    .neq("post_type", "story")
    .not("platform_post_id", "is", null)
    .gte("posted_at", since);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ postId: string; ok: boolean; score?: number; error?: string }> = [];
  const affected = new Set<string>();

  for (const post of posts ?? []) {
    const { metrics, error: fetchErr } = await fetchInsights(post.platform_post_id as string, token);
    if (!metrics) {
      results.push({ postId: post.id, ok: false, error: fetchErr });
      continue;
    }
    // Merge over existing engagement so manual fields (fanvue_clicks…) survive;
    // drop undefined values so a smaller metric set doesn't erase richer old data.
    const cleaned = Object.fromEntries(Object.entries(metrics).filter(([, v]) => v !== undefined));
    const merged = { ...(post.engagement as Record<string, unknown> ?? {}), ...cleaned };
    const score = calculateGrowthScore(merged as GrowthMetrics);
    const { error: upErr } = await supabase
      .from("chs_posts")
      .update({ engagement: merged, growth_score: score })
      .eq("id", post.id);
    if (upErr) {
      results.push({ postId: post.id, ok: false, error: upErr.message });
      continue;
    }
    if (post.character_id) affected.add(post.character_id as string);
    results.push({ postId: post.id, ok: true, score });
  }

  // Recompute winners (top ~30% by score) per affected character — same rule as import-metrics.
  for (const characterId of affected) {
    const { data: scored } = await supabase
      .from("chs_posts")
      .select("id, growth_score")
      .eq("character_id", characterId)
      .gt("growth_score", 0)
      .order("growth_score", { ascending: false });
    if (!scored || scored.length === 0) continue;
    const cutoffIdx = Math.max(0, Math.floor(scored.length * 0.3) - 1);
    const threshold = Number(scored[cutoffIdx].growth_score) || 0;
    const winners = scored.filter((p) => Number(p.growth_score) >= threshold).map((p) => p.id);
    const losers = scored.filter((p) => Number(p.growth_score) < threshold).map((p) => p.id);
    if (winners.length) await supabase.from("chs_posts").update({ growth_winner: true }).in("id", winners);
    if (losers.length) await supabase.from("chs_posts").update({ growth_winner: false }).in("id", losers);
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({ success: true, imported: ok, total: results.length, results });
}

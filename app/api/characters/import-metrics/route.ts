import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateGrowthScore, GrowthMetrics } from "@/lib/growthScore";

export const runtime = "nodejs";

// GROWTH LAYER — manual daily metric import. Stores numbers in the existing chs_posts.engagement jsonb,
// computes growth_score, then recomputes growth_winner (top ~30%) per affected character.
// Read/scoring works regardless of the growth_layer flag; the flag only gates whether the bias is applied.

interface ItemIn { postId: string; metrics: GrowthMetrics }

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: ItemIn[] = Array.isArray(body?.items)
      ? body.items
      : body?.postId
        ? [{ postId: body.postId, metrics: body.metrics ?? {} }]
        : [];
    if (items.length === 0) return NextResponse.json({ error: "no items" }, { status: 400 });

    const affected = new Set<string>();
    const results: Array<{ postId: string; score: number; ok: boolean; error?: string }> = [];

    for (const it of items) {
      const { data: post } = await supabase
        .from("chs_posts")
        .select("id, character_id, engagement")
        .eq("id", it.postId)
        .single();
      if (!post) { results.push({ postId: it.postId, score: 0, ok: false, error: "not found" }); continue; }

      const merged = { ...(post.engagement as Record<string, unknown> ?? {}), ...it.metrics };
      const score = calculateGrowthScore(merged as GrowthMetrics);
      const { error } = await supabase
        .from("chs_posts")
        .update({ engagement: merged, growth_score: score })
        .eq("id", it.postId);
      if (error) { results.push({ postId: it.postId, score, ok: false, error: error.message }); continue; }
      if (post.character_id) affected.add(post.character_id as string);
      results.push({ postId: it.postId, score, ok: true });
    }

    // Recompute winners (top ~30% by score) per affected character.
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

    return NextResponse.json({ success: true, updated: results.filter((r) => r.ok).length, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

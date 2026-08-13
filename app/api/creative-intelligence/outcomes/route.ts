import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { evaluateStrategyOutcomes, summarizeStrategyEffectiveness } from "@/lib/creativeIntelligence/outcomeEvaluator";
import type { Horizon } from "@/lib/creativeIntelligence/performanceSnapshots";

export const runtime = "nodejs";
export const maxDuration = 60;

function isHorizon(v: string | null): v is Horizon {
  return v === "24h" || v === "72h" || v === "7d";
}

// GET /api/creative-intelligence/outcomes?characterId=&horizon=72h
// Closed-loop CI evaluation (read-only): did CI-guided posts actually outperform a comparable
// baseline, and how closely did the generated content follow the recommendation that shaped it?
// Computed on demand at request time (see lib/creativeIntelligence/outcomeEvaluator.ts) — no new
// cron, never writes anywhere, never touches the generation/selection path.
export async function GET(req: Request) {
  const url = new URL(req.url);
  let characterId = url.searchParams.get("characterId");
  const horizonParam = url.searchParams.get("horizon");
  const primaryHorizon: Horizon = isHorizon(horizonParam) ? horizonParam : "72h";

  if (!characterId) {
    const { data } = await supabase.from("chs_characters").select("id").eq("is_active", true).limit(1).maybeSingle();
    characterId = data?.id ?? null;
  }
  if (!characterId) return NextResponse.json({ error: "No active character found" }, { status: 404 });

  try {
    const [summary, outcomes] = await Promise.all([
      summarizeStrategyEffectiveness(characterId, primaryHorizon),
      evaluateStrategyOutcomes(characterId, primaryHorizon),
    ]);
    return NextResponse.json({ success: true, summary, outcomes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

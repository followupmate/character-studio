import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runCreativeIntelligence } from "@/lib/creativeIntelligence";
import { getLatestStrategySnapshot } from "@/lib/creativeIntelligence/strategyGenerator";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/creative-intelligence/strategy?characterId=&days=7&fresh=1
// Next Content Strategy (E): what to make next, and why. By default reads the latest snapshot
// written by the analytics-only cron; pass ?fresh=1 to recompute on demand (does not persist
// unless the cron does it — this route is read/compute only, never triggers generation).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days")) || 7, 30);
  const fresh = url.searchParams.get("fresh") === "1";
  let characterId = url.searchParams.get("characterId");

  if (!characterId) {
    const { data } = await supabase.from("chs_characters").select("id").eq("is_active", true).limit(1).maybeSingle();
    characterId = data?.id ?? null;
  }
  if (!characterId) return NextResponse.json({ error: "No active character found" }, { status: 404 });

  try {
    if (!fresh) {
      const snapshot = await getLatestStrategySnapshot(characterId);
      if (snapshot) return NextResponse.json({ success: true, strategy: snapshot, source: "snapshot" });
    }
    const { strategy } = await runCreativeIntelligence(characterId, days * 4, days);
    return NextResponse.json({ success: true, strategy, source: "live" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

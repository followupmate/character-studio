import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runCreativeIntelligence } from "@/lib/creativeIntelligence";
import { getLatestStrategySnapshot } from "@/lib/creativeIntelligence/strategyGenerator";
import { resolveWindowDays } from "@/lib/creativeIntelligence/window";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/creative-intelligence/strategy?characterId=&window=7|30|90|all&count=7&fresh=1
// Next Content Strategy (E): what to make next, and why. On a bare default load (no window
// picked), reads the latest snapshot written by the analytics-only cron. As soon as the
// dashboard's window toggle is used (window/days present) — or ?fresh=1 is explicit — this
// recomputes live against that specific window, since a stale snapshot from a different
// window would silently mismatch what the user asked to see. Read/compute only, never
// triggers generation.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const windowDays = resolveWindowDays(url);
  const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 7, 1), 14);
  const explicitWindow = url.searchParams.has("window") || url.searchParams.has("days");
  const fresh = url.searchParams.get("fresh") === "1" || explicitWindow;
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
    const { strategy } = await runCreativeIntelligence(characterId, windowDays, count);
    return NextResponse.json({ success: true, strategy, source: "live" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireCron } from "@/lib/apiAuth";
import { runCreativeIntelligence } from "@/lib/creativeIntelligence";
import { saveStrategySnapshot } from "@/lib/creativeIntelligence/strategyGenerator";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/creative-intelligence/cron/refresh — analytics-only daily job.
// Scheduled to run AFTER /api/publish/import-insights (which fetches real IG metrics into
// chs_posts.engagement) so this always recomputes on top of the freshest real data.
//
// Explicitly does NOT call Higgsfield/Kling and does NOT generate any media — it only
// recomputes Content/Performance/Motion Intelligence and persists a Next Content Strategy
// snapshot for the dashboard to read. Paid generation stays a deliberate, separate,
// user-triggered action.
export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  const { data: characters, error } = await supabase.from("chs_characters").select("id").eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!characters || characters.length === 0) {
    return NextResponse.json({ success: true, message: "No active characters" });
  }

  const results: Array<{ characterId: string; ok: boolean; dataStatus?: string; error?: string }> = [];

  for (const char of characters) {
    try {
      const { strategy } = await runCreativeIntelligence(char.id as string, 30, 7);
      await saveStrategySnapshot(strategy);
      results.push({ characterId: char.id as string, ok: true, dataStatus: strategy.data_status });
    } catch (err) {
      results.push({ characterId: char.id as string, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return NextResponse.json({ success: true, results });
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight per-slot generation status for a batch — polled by GenerateDayButton
// while the one-click day generation runs, so the UI can show real progress
// instead of a time-based estimate.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const batchId = url.searchParams.get("batchId");
  if (!batchId) {
    return NextResponse.json({ error: "batchId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chs_media")
    .select("id, slot, type, channel, sequence_index, media_url, generation_status, last_error")
    .eq("batch_id", batchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slots = (data ?? [])
    .sort((a, b) => {
      const ai = a.sequence_index ?? 99;
      const bi = b.sequence_index ?? 99;
      if (ai !== bi) return ai - bi;
      return (a.slot ?? "").localeCompare(b.slot ?? "");
    })
    .map((m) => ({
      id: m.id,
      slot: m.slot,
      type: m.type,
      channel: m.channel,
      hasMedia: !!m.media_url,
      status: m.generation_status ?? "pending",
      error: m.last_error,
    }));

  return NextResponse.json({ slots });
}

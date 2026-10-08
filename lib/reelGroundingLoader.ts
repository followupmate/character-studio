// Phase 6 — loads the final-shot text for a reel's caption grounding (see lib/captionGrounding.ts).
// Read-only. Returns null on any problem so publishing is never blocked by grounding.

import { supabase } from "@/lib/supabase";
import { reelGroundingText } from "@/lib/captionGrounding";

export async function loadReelGroundingText(reelMediaId: string | null | undefined): Promise<string | null> {
  if (!reelMediaId) return null;
  try {
    const { data: reel } = await supabase
      .from("chs_media")
      .select("id, batch_id, higgsfield_prompt")
      .eq("id", reelMediaId)
      .maybeSingle();
    const r = reel as { batch_id?: string | null; higgsfield_prompt?: string | null } | null;
    if (!r || typeof r !== "object") return null;
    let startFramePrompt: string | null = null;
    if (typeof r.batch_id === "string" && r.batch_id) {
      const { data: sf } = await supabase
        .from("chs_media")
        .select("higgsfield_prompt")
        .eq("batch_id", r.batch_id)
        .eq("slot", "reel_start_frame")
        .maybeSingle();
      const p = (sf as { higgsfield_prompt?: unknown } | null)?.higgsfield_prompt;
      startFramePrompt = typeof p === "string" ? p : null;
    }
    const rv = typeof r.higgsfield_prompt === "string" ? r.higgsfield_prompt : null;
    return reelGroundingText(startFramePrompt, rv);
  } catch (e) {
    console.warn("[reel-grounding] could not load grounding text:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

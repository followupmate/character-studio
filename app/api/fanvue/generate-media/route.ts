import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateSoulImage, soulConfigured, FALLBACK_SOUL_ID } from "@/lib/higgsfieldSoul";

export const runtime = "nodejs";
export const maxDuration = 300;

// FANVUE AUTOPILOT step 1 — turn a text-only unlock draft into a sellable photo set.
// Generates `count` images from the draft's fanvue_prompt via Higgsfield Soul (the
// engine that already handles intimate content with the trained identity) and
// stores the URLs on the draft row. Nothing leaves our storage here — publishing
// to Fanvue is a separate, explicitly confirmed step.

export async function POST(req: Request) {
  try {
    const { unlockId, count = 3 } = await req.json() as { unlockId?: string; count?: number };
    if (!unlockId) return NextResponse.json({ error: "unlockId required" }, { status: 400 });
    if (!soulConfigured()) return NextResponse.json({ error: "HIGGSFIELD_API_KEY not configured" }, { status: 500 });

    const n = Math.max(1, Math.min(Number(count) || 3, 4));

    const { data: unlock } = await supabase
      .from("chs_fanvue_unlocks")
      .select("id, character_id, fanvue_prompt, title, series_name, intensity")
      .eq("id", unlockId)
      .single();
    if (!unlock) return NextResponse.json({ error: "Unlock draft not found" }, { status: 404 });
    if (!unlock.fanvue_prompt) return NextResponse.json({ error: "Draft has no fanvue_prompt" }, { status: 422 });

    const { data: character } = await supabase
      .from("chs_characters")
      .select("soul_id")
      .eq("id", unlock.character_id)
      .single();
    const soulId = (character?.soul_id as string | null) ?? FALLBACK_SOUL_ID;

    // Angle variations so the set reads as a shoot, not the same frame N times.
    const ANGLES = [
      "Framing: full scene, subject centered, direct gaze.",
      "Framing: closer crop, three-quarter angle, candid moment.",
      "Framing: detail shot from behind shoulder, face partially visible in profile.",
      "Framing: wider environmental shot, subject looking away naturally.",
    ];

    const urls: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < n; i++) {
      try {
        const url = await generateSoulImage({
          prompt: `${unlock.fanvue_prompt} ${ANGLES[i % ANGLES.length]}`,
          soulId,
          aspect: "3:4",
          mediaId: `fanvue-${unlockId}-${i + 1}`,
        });
        urls.push(`${url.split("?")[0]}?t=${Date.now()}`);
      } catch (err) {
        errors.push(`#${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (urls.length === 0) {
      return NextResponse.json({ error: `Generovanie zlyhalo — ${errors.join(" | ")}` }, { status: 502 });
    }

    await supabase
      .from("chs_fanvue_unlocks")
      .update({ media_urls: urls, fanvue_media_uuids: null, publish_error: null })
      .eq("id", unlockId);

    return NextResponse.json({ success: true, media_urls: urls, failed: errors.length, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

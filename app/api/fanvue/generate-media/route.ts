import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { soulConfigured, FALLBACK_SOUL_ID, generateSoulImage } from "@/lib/higgsfieldSoul";
import { getBaseImageNegatives } from "@/lib/promptDirector/negativeBuilder"; // F0.5
import { providerFor } from "@/lib/fanvueMediaProvider";
import type { FanvueContinuationPlan, ShotStep } from "@/lib/fanvueContinuation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Item 11 — greps for the distinct prefix classifyHiggsfieldFailure()/generateSoulImage() now
// throw on a 401/403, so N confusing per-shot messages can collapse into one clear top-level
// flag the client checks first instead of parsing free-text errors.
function anyHiggsfieldAuthError(errors: string[]): boolean {
  return errors.some((e) => e.includes("Higgsfield credential invalid"));
}

// FANVUE AUTOPILOT step 1 — turn a draft into a sellable photo set.
//
// Legacy drafts (pipeline_version="legacy"): generates `count` images from the draft's flat
// fanvue_prompt via Higgsfield Soul, unchanged behaviour.
//
// fanvue_paid_continuation_v1 drafts (pipeline_version="paid_continuation_v1"): generates from
// the draft's continuation_plan.shots[] instead — each shot has its own prompt/intensity. Pass
// `step` to regenerate a single shot; omit it to generate every pending shot in the set. Routed
// through lib/fanvueMediaProvider.ts so a content_level the current provider doesn't support
// (explicit_adult) never reaches Higgsfield and fails on NSFW — it's rejected up front instead.
//
// Nothing leaves our storage here — publishing to Fanvue is a separate, explicitly confirmed step.

export async function POST(req: Request) {
  try {
    const { unlockId, count = 3, step } = await req.json() as { unlockId?: string; count?: number; step?: ShotStep };
    if (!unlockId) return NextResponse.json({ error: "unlockId required" }, { status: 400 });
    if (!soulConfigured()) return NextResponse.json({ error: "HIGGSFIELD_API_KEY not configured" }, { status: 500 });

    const { data: unlock } = await supabase
      .from("chs_fanvue_unlocks")
      .select("id, character_id, fanvue_prompt, title, series_name, intensity, pipeline_version, content_level, continuation_plan")
      .eq("id", unlockId)
      .single();
    if (!unlock) return NextResponse.json({ error: "Unlock draft not found" }, { status: 404 });

    const { data: character } = await supabase
      .from("chs_characters")
      .select("soul_id")
      .eq("id", unlock.character_id)
      .single();
    const soulId = (character?.soul_id as string | null) ?? FALLBACK_SOUL_ID;

    if (unlock.pipeline_version === "paid_continuation_v1") {
      const plan = unlock.continuation_plan as FanvueContinuationPlan | null;
      if (!plan) return NextResponse.json({ error: "Draft has no continuation_plan" }, { status: 422 });

      const provider = providerFor(plan.content_level);
      if (!provider) {
        return NextResponse.json(
          {
            error: `Current provider does not support content_level "${plan.content_level}" — use manual upload for this set instead.`,
            providerUnsupported: true,
          },
          { status: 422 }
        );
      }

      const targetSteps: ShotStep[] = step ? [step] : plan.shots.map((s) => s.step);
      const shots = [...plan.shots];
      const genErrors: string[] = [];

      for (const targetStep of targetSteps) {
        const idx = shots.findIndex((s) => s.step === targetStep);
        if (idx === -1) continue;
        const shot = shots[idx];
        try {
          const url = await provider.generate({
            prompt: shot.prompt,
            soulId,
            mediaId: `fanvue-${unlockId}-${targetStep}`,
            aspect: "3:4",
          });
          shots[idx] = { ...shot, media_url: `${url.split("?")[0]}?t=${Date.now()}`, status: "generated" };
        } catch (err) {
          shots[idx] = { ...shot, status: "failed" };
          genErrors.push(`${targetStep}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const updatedPlan: FanvueContinuationPlan = { ...plan, shots };
      const mediaUrls = shots.filter((s) => s.media_url).map((s) => s.media_url as string);

      if (mediaUrls.length === 0) {
        return NextResponse.json(
          { error: `Generovanie zlyhalo — ${genErrors.join(" | ")}`, higgsfieldAuthError: anyHiggsfieldAuthError(genErrors) },
          { status: 502 }
        );
      }

      await supabase
        .from("chs_fanvue_unlocks")
        .update({ continuation_plan: updatedPlan, media_urls: mediaUrls, fanvue_media_uuids: null, publish_error: null })
        .eq("id", unlockId);

      return NextResponse.json({
        success: true,
        continuation_plan: updatedPlan,
        media_urls: mediaUrls,
        failed: genErrors.length,
        errors: genErrors,
        higgsfieldAuthError: anyHiggsfieldAuthError(genErrors),
      });
    }

    // Legacy pipeline — unchanged behaviour.
    if (!unlock.fanvue_prompt) return NextResponse.json({ error: "Draft has no fanvue_prompt" }, { status: 422 });
    const n = Math.max(1, Math.min(Number(count) || 3, 4));

    // Angle variations so the set reads as a shoot, not the same frame N times.
    const ANGLES = [
      "Framing: full scene, subject centered, direct gaze.",
      "Framing: closer crop, three-quarter angle, candid moment.",
      "Framing: detail shot from behind shoulder, face partially visible in profile.",
      "Framing: wider environmental shot, subject looking away naturally.",
    ];

    const urls: string[] = [];
    const legacyErrors: string[] = [];
    for (let i = 0; i < n; i++) {
      try {
        // F0.5 — include base image negatives
        const url = await generateSoulImage({
          prompt: `${unlock.fanvue_prompt} ${ANGLES[i % ANGLES.length]}`,
          negativePrompt: getBaseImageNegatives(),
          soulId,
          aspect: "3:4",
          mediaId: `fanvue-${unlockId}-${i + 1}`,
        });
        urls.push(`${url.split("?")[0]}?t=${Date.now()}`);
      } catch (err) {
        legacyErrors.push(`#${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (urls.length === 0) {
      return NextResponse.json(
        { error: `Generovanie zlyhalo — ${legacyErrors.join(" | ")}`, higgsfieldAuthError: anyHiggsfieldAuthError(legacyErrors) },
        { status: 502 }
      );
    }

    await supabase
      .from("chs_fanvue_unlocks")
      .update({ media_urls: urls, fanvue_media_uuids: null, publish_error: null })
      .eq("id", unlockId);

    return NextResponse.json({
      success: true,
      media_urls: urls,
      failed: legacyErrors.length,
      errors: legacyErrors,
      higgsfieldAuthError: anyHiggsfieldAuthError(legacyErrors),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractSituation } from "@/lib/situationPlanner";
import { buildFanvueContinuationPlan, validatePaidValue, duplicatePersonRisk } from "@/lib/fanvueContinuation";
import type { ContentLevel, FanvueContinuationPlan, ShotStep, ShotIntensity } from "@/lib/fanvueContinuation";
import type { StoryTier, MagnetismLevel } from "@/lib/storyTier";

export const runtime = "nodejs";

// Update a Fanvue unlock DRAFT's status (draft → ready → archived), edit copy fields, or — for
// fanvue_paid_continuation_v1 drafts — change content_level (full storyboard rebuild), patch a
// single shot's prompt/intensity, or (from a Legacy draft card) manually convert it to the v1
// shape. This only touches our DB (chs_fanvue_unlocks). It NEVER publishes to Fanvue or calls
// the Fanvue MCP.
const ALLOWED_STATUS = ["draft", "ready", "posted", "archived"];
const EDITABLE = ["series_name", "title", "teaser_text", "sales_copy", "suggested_price", "intensity", "ig_cta", "fanvue_prompt"];
const CONTENT_LEVELS: ContentLevel[] = ["premium_sensual", "erotic_tease", "explicit_adult"];
const SHOT_STEPS: ShotStep[] = ["bridge", "private_access", "escalation", "reveal", "payoff", "afterglow"];
const COMMERCIAL_MODES = ["subscription", "ppv", "bundle"] as const;

// Refetches the source chs_story_days row + its embedded situation and rebuilds a full
// FanvueContinuationPlan for it. Shared by the content_level rebuild path and the legacy→v1
// manual conversion path. wardrobe isn't persisted on the unlock row, so the rebuild omits it
// (buildShotPrompt treats it as optional).
async function rebuildPlanFor(unlock: { story_day_id: string; series_name: string }, contentLevelOverride?: ContentLevel) {
  const { data: storyDay } = await supabase
    .from("chs_story_days")
    .select("tier, moment_family, magnetism_level, location, mood, ig_caption, hook_text, scene")
    .eq("id", unlock.story_day_id)
    .single();
  if (!storyDay) return null;

  const situation = extractSituation(storyDay);

  return buildFanvueContinuationPlan({
    tier: (storyDay.tier ?? "everyday_life") as StoryTier,
    series: unlock.series_name,
    storyDay: {
      tier: storyDay.tier ?? null,
      moment_family: storyDay.moment_family ?? null,
      magnetism_level: storyDay.magnetism_level ?? null,
      location: storyDay.location ?? null,
      mood: storyDay.mood ?? null,
      ig_caption: storyDay.ig_caption ?? null,
      hook_text: storyDay.hook_text ?? null,
    },
    wardrobe: "",
    magnetism: (storyDay.magnetism_level ?? null) as MagnetismLevel | null,
    situationTension: situation?.fanvue_tension,
    sensualVisualLanguage: situation?.sensual_visual_language,
    sexAppealStyle: situation?.sex_appeal_style,
    luxurySeduction: situation?.luxury_seduction,
    playfulHotWorld: situation?.playful_hot_world,
    contentLevelOverride,
    // validateFanvueSource() inputs (item 0) — same situation !== null derivation as
    // lib/dailyBatch.ts's call site (a non-null situation always passed the story-generation
    // retry loop's validation by construction).
    situation,
    situationValidated: situation !== null,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const contentLevel = body.contentLevel as ContentLevel | undefined;
    const shotPatch = body.shotPatch as { step?: ShotStep; prompt?: string; intensity?: ShotIntensity; mediaUrl?: string; approve?: boolean } | undefined;
    const commercialModeOverride = body.commercialModeOverride as "subscription" | "ppv" | "bundle" | undefined;
    const planPatch = body.planPatch as { source_tease?: string; paid_promise?: string } | undefined;
    const status = typeof body.status === "string" ? body.status : undefined;
    const convertToV1 = body.convertToV1 === true;

    if (status && !ALLOWED_STATUS.includes(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    if (contentLevel && !CONTENT_LEVELS.includes(contentLevel)) return NextResponse.json({ error: "bad contentLevel" }, { status: 400 });
    if (shotPatch?.step && !SHOT_STEPS.includes(shotPatch.step)) return NextResponse.json({ error: "bad shotPatch.step" }, { status: 400 });
    if (commercialModeOverride && !COMMERCIAL_MODES.includes(commercialModeOverride)) return NextResponse.json({ error: "bad commercialModeOverride" }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (status) update.status = status;
    for (const k of EDITABLE) if (k in body) update[k] = body[k];

    const needsUnlockRow = !!(contentLevel || shotPatch?.step || planPatch || status === "ready" || convertToV1 || commercialModeOverride);
    let paidValueWarning: string[] | undefined;
    let sourceValidationWarning: string[] | undefined;
    let promptRiskWarning: string | undefined;

    if (needsUnlockRow) {
      const { data: unlock } = await supabase
        .from("chs_fanvue_unlocks")
        .select("id, character_id, story_day_id, series_name, pipeline_version, continuation_plan")
        .eq("id", id)
        .single();
      if (!unlock) return NextResponse.json({ error: "draft not found" }, { status: 404 });

      const isV1 = unlock.pipeline_version === "paid_continuation_v1" && !!unlock.continuation_plan;

      // Legacy → v1 manual conversion (explicit user action from the Legacy draft card).
      // Never automatic, never overwrites without the caller having confirmed in the UI first.
      if (convertToV1 && !isV1) {
        const plan = await rebuildPlanFor(unlock);
        if (!plan) return NextResponse.json({ error: "source story day not found — cannot build storyboard" }, { status: 422 });
        update.pipeline_version = "paid_continuation_v1";
        update.content_level = plan.content_level;
        update.continuation_plan = plan;
        update.unlock_type = plan.commercial.mode;
        update.suggested_price = plan.commercial.price_eur;
        update.intensity = plan.content_level === "premium_sensual" ? "medium" : "strong";
        update.fanvue_prompt = null;
        update.media_urls = null;
        update.fanvue_media_uuids = null;
        update.publish_error = null;
      } else if (isV1) {
        let plan = unlock.continuation_plan as FanvueContinuationPlan;

        if (contentLevel) {
          // explicit_adult gate: re-checked server-side against the DB, never trusted from the
          // request — a client cannot bypass this by sending adult_content_verified in the body.
          if (contentLevel === "explicit_adult") {
            const { data: character } = await supabase
              .from("chs_characters")
              .select("adult_content_verified")
              .eq("id", unlock.character_id)
              .single();
            if (!character?.adult_content_verified) {
              return NextResponse.json({ error: "explicit_adult requires adult_content_verified=true on this character (Character Settings)" }, { status: 403 });
            }
          }

          const rebuilt = await rebuildPlanFor(unlock, contentLevel);
          if (!rebuilt) return NextResponse.json({ error: "source story day not found — cannot rebuild storyboard" }, { status: 422 });
          plan = rebuilt;

          update.content_level = plan.content_level;
          update.unlock_type = plan.commercial.mode;
          update.suggested_price = plan.commercial.price_eur;
          update.intensity = plan.content_level === "premium_sensual" ? "medium" : "strong";
          update.media_urls = null;
          update.fanvue_media_uuids = null;
          update.publish_error = null;
        }

        if (commercialModeOverride) {
          // Item 4 — a narrow, dedicated override path that keeps unlock_type (DB column) and
          // continuation_plan.commercial.mode (what the UI displays) in lockstep in one
          // transaction, without touching buildFanvueContinuationPlan/buildCommercialSetup at
          // all (no auto-optimization doctrine intact). NOTE: a subsequent contentLevel change
          // rebuilds the whole plan (including commercial.mode from FANVUE_RULES), overwriting
          // this override — surfaced to the user as a UI hint, not enforced here.
          plan = { ...plan, commercial: { ...plan.commercial, mode: commercialModeOverride } };
          update.unlock_type = commercialModeOverride;
        }

        if (shotPatch?.step) {
          // Item 10 — manual media attach for an explicit_adult shot is re-checked against the
          // DB's adult_content_verified, same as the content_level="explicit_adult" gate above.
          // Without this, a row that reached explicit_adult while verified could still receive a
          // manually-attached image after verification was later revoked.
          if (shotPatch.mediaUrl !== undefined && plan.content_level === "explicit_adult") {
            const { data: character } = await supabase
              .from("chs_characters")
              .select("adult_content_verified")
              .eq("id", unlock.character_id)
              .single();
            if (!character?.adult_content_verified) {
              return NextResponse.json({ error: "explicit_adult requires adult_content_verified=true on this character (Character Settings)" }, { status: 403 });
            }
          }

          const shots = plan.shots.map((s) => {
            if (s.step !== shotPatch.step) return s;
            const next = { ...s };
            // Editing prompt/intensity invalidates whatever media was generated for the old shot.
            if (shotPatch.prompt !== undefined) { next.prompt = shotPatch.prompt; next.status = "pending"; next.media_url = null; }
            if (shotPatch.intensity !== undefined) { next.intensity = shotPatch.intensity; next.status = "pending"; next.media_url = null; }
            // Manual upload path (content_level="explicit_adult", which the current provider
            // doesn't generate — see lib/fanvueMediaProvider.ts): attach an externally produced
            // URL directly, then mark it "approved" once the user has reviewed it.
            if (shotPatch.mediaUrl !== undefined) { next.media_url = shotPatch.mediaUrl; next.status = "generated"; }
            if (shotPatch.approve) next.status = "approved";
            return next;
          });
          plan = { ...plan, shots };
          update.media_urls = shots.filter((s) => s.media_url).map((s) => s.media_url as string);

          // Item 7 — non-blocking (live human-edited free text, not a generated-then-validated
          // situation). Surfaced alongside paidValueWarning, never a hard 409 like the ready gate.
          if (shotPatch.prompt !== undefined) {
            const risk = duplicatePersonRisk(shotPatch.prompt);
            if (risk) promptRiskWarning = risk;
          }
        }

        if (planPatch) {
          plan = {
            ...plan,
            ...(planPatch.source_tease !== undefined ? { source_tease: planPatch.source_tease } : {}),
            ...(planPatch.paid_promise !== undefined ? { paid_promise: planPatch.paid_promise } : {}),
          };
        }

        if (contentLevel || shotPatch?.step || planPatch || commercialModeOverride) update.continuation_plan = plan;

        // Paid-value gate: marking an erotic_tease draft "ready" when it doesn't clearly beat
        // Instagram is BLOCKED (409) unless the caller explicitly re-sends the same request with
        // confirmWeakPaidValue:true — this is a hard gate, not just an after-the-fact warning, so
        // a weak set can't silently reach "ready" (and from there, publish) unnoticed.
        if (status === "ready") {
          const check = validatePaidValue(plan);
          if (!check.passes) {
            if (!body.confirmWeakPaidValue) {
              return NextResponse.json(
                { error: "weak paid-value — requires confirmation", paidValueWarning: check.reasons, requiresConfirmation: true },
                { status: 409 }
              );
            }
            paidValueWarning = check.reasons;
          }

          // Item 0 — source-eligibility gate (validateFanvueSource, currently intimate_aesthetic
          // only — a no-op for every other tier). Same hard-409-unless-confirmed pattern as the
          // paid-value gate above; `plan.source_validation` is undefined-safe for pre-item-0 rows
          // (only blocks when explicitly ok:false, never on missing data from an older plan).
          if (plan.source_validation?.ok === false) {
            if (!body.confirmWeakSource) {
              return NextResponse.json(
                { error: "weak source situation — requires confirmation", sourceValidationWarning: plan.source_validation.reasons, requiresConfirmation: true },
                { status: 409 }
              );
            }
            sourceValidationWarning = plan.source_validation.reasons;
          }
        }
      }
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const { error } = await supabase.from("chs_fanvue_unlocks").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Echo back the applied patch so the client can merge it into local state without a refetch
    // (relevant for contentLevel rebuilds / shotPatch / planPatch / convertToV1, which compute
    // fields server-side rather than just passing through the request body).
    return NextResponse.json({ success: true, paidValueWarning, sourceValidationWarning, promptRiskWarning, update });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

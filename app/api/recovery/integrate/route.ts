import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/apiAuth";
import { compileRecoveryDays, RECOVERY_VERSION } from "@/lib/recovery/recoveryDays";
import { compileRecoveryStartFrame, START_FRAME_FRAMING_NEGATIVES } from "@/lib/recovery/simpleReelCompiler";

export const runtime = "nodejs";
export const maxDuration = 60;

// RECOVERY INTEGRATION — fold the five recovery reels into the NORMAL Character Studio calendar.
//
// Recovery is not a parallel workflow. After this runs, a recovery reel is an ordinary
// chs_daily_plans reel slot that shows up in /review like any other day, is approved with the same
// button, generates through the same route, and publishes through the existing /api/publish/cron.
// The only thing that marks it is a badge.
//
// WHAT THIS TOUCHES
//   - the reel_start_frame and reel_video media rows of the target plans (prompt + provenance)
//   - the target plans' content_mix (a merged recovery marker)
// WHAT IT NEVER TOUCHES
//   - chs_story_days (the arc is not rewritten)
//   - story_bts slots (stories keep their own day's brief — one variable at a time)
//   - chs_posts (nothing published, scheduled or approved is altered)
//   - the plans' scene_brief for days that have a real story day: the story slot still needs it
//
// IDEMPOTENT. Re-running produces the same state: assets already rendered for a recovery index are
// carried to wherever that index now lives, rather than regenerated or dropped.

interface MediaRow {
  id: string;
  batch_id: string;
  slot: string;
  status: string | null;
  generation_status: string | null;
  media_url: string | null;
  source_url: string | null;
  visual_signature: Record<string, unknown> | null;
}

/** An already-rendered recovery asset, keyed by recovery index so it follows its reel. */
interface SavedAsset {
  media_url: string | null;
  source_url: string | null;
  status: string | null;
  generation_status: string | null;
  provenance: unknown;
  origin_media_id: string;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { fromDate?: string; apply?: boolean; characterId?: string };
  const fromDate = body.fromDate ?? new Date().toISOString().slice(0, 10);
  const apply = body.apply === true; // dry run unless explicitly asked to write

  let characterId = body.characterId;
  if (!characterId) {
    const { data: chars } = await supabase.from("chs_characters").select("id").eq("is_active", true).limit(2);
    if (!chars || chars.length !== 1) {
      return NextResponse.json({ error: "pass characterId — could not resolve a single active character" }, { status: 400 });
    }
    characterId = chars[0].id as string;
  }

  const days = compileRecoveryDays();

  // ── 1. the existing calendar, from fromDate forward ──────────────────────
  const { data: plans, error: planErr } = await supabase
    .from("chs_daily_plans")
    .select("id, date, batch_status, story_day_id, content_mix")
    .eq("character_id", characterId)
    .gte("date", fromDate)
    .order("date", { ascending: true });
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  const planIds = (plans ?? []).map((p) => p.id as string);
  const { data: mediaRaw, error: mediaErr } = await supabase
    .from("chs_media")
    .select("id, batch_id, slot, status, generation_status, media_url, source_url, visual_signature")
    .in("batch_id", planIds.length > 0 ? planIds : ["00000000-0000-0000-0000-000000000000"]);
  if (mediaErr) return NextResponse.json({ error: mediaErr.message }, { status: 500 });
  const media = (mediaRaw ?? []) as unknown as MediaRow[];
  const mediaByPlan = new Map<string, MediaRow[]>();
  for (const m of media) {
    const list = mediaByPlan.get(m.batch_id) ?? [];
    list.push(m);
    mediaByPlan.set(m.batch_id, list);
  }

  // ── 2. STOP CONDITIONS — anything published, scheduled or approved is untouchable ──
  const storyDayIds = (plans ?? []).map((p) => p.story_day_id).filter(Boolean) as string[];
  const { data: posts } = storyDayIds.length
    ? await supabase.from("chs_posts").select("id, story_day_id, post_type, status").in("story_day_id", storyDayIds)
    : { data: [] as Array<{ id: string; story_day_id: string; post_type: string; status: string }> };

  const blocked: string[] = [];
  for (const p of plans ?? []) {
    const rows = mediaByPlan.get(p.id as string) ?? [];
    const reelRows = rows.filter((m) => m.slot === "reel_start_frame" || m.slot === "reel_video");
    const dayPosts = (posts ?? []).filter((x) => x.story_day_id === p.story_day_id);
    // A reel that already produced a post — scheduled or posted — is user-approved content.
    if (dayPosts.some((x) => x.post_type.startsWith("reel"))) {
      blocked.push(`${p.date}: a reel post already exists (status ${dayPosts.map((x) => x.status).join("/")})`);
    }
    // A reel already rendered by something OTHER than recovery must not be silently replaced.
    for (const m of reelRows) {
      const isRecovery = !!(m.visual_signature as { recovery?: unknown } | null)?.recovery;
      if (m.media_url && !isRecovery) {
        blocked.push(`${p.date}: ${m.slot} already holds non-recovery media (${m.id})`);
      }
    }
  }

  // ── 3. targets: the nearest existing plans that can carry a recovery reel ──
  //
  // A target must have BOTH a reel_video slot and a story_day_id. The story day is not decoration:
  // app/review/page.tsx drops any plan whose story day is missing (`if (!storyDay) return null`)
  // and /api/review/approve refuses without a storyDayId. A recovery reel parked on a
  // story-day-less plan would be invisible in the calendar and unapprovable — the exact opposite
  // of folding recovery into the normal flow. So those plans are never targets, however convenient
  // their date.
  const candidates = (plans ?? []).filter(
    (p) => !!p.story_day_id && (mediaByPlan.get(p.id as string) ?? []).some((m) => m.slot === "reel_video")
  );
  const targets = candidates.slice(0, days.length);

  // Recovery plans with no story day are artefacts of the earlier standalone prepare step. Once
  // their asset has been carried to a real calendar slot they hold nothing unique, and leaving them
  // would be exactly the duplicate plan this task forbids.
  const orphanRecoveryPlans = (plans ?? []).filter((p) => {
    if (p.story_day_id) return false;
    const mix = p.content_mix as { recovery?: unknown } | null;
    return !!mix?.recovery;
  });

  // ── 4. carry already-rendered assets by recovery index, not by row ────────
  const savedByIndex = new Map<number, SavedAsset>();
  for (const m of media) {
    const rec = (m.visual_signature as { recovery?: { slot?: number } } | null)?.recovery;
    if (!rec?.slot || !m.media_url) continue;
    const key = `${rec.slot}:${m.slot}`;
    savedByIndex.set(hashKey(key), {
      media_url: m.media_url,
      source_url: m.source_url,
      status: m.status,
      generation_status: m.generation_status,
      provenance: (m.visual_signature as { provider_provenance?: unknown } | null)?.provider_provenance ?? null,
      origin_media_id: m.id,
    });
  }

  const report = targets.map((p, i) => {
    const day = days[i];
    const rows = mediaByPlan.get(p.id as string) ?? [];
    const video = rows.find((m) => m.slot === "reel_video");
    const frame = rows.find((m) => m.slot === "reel_start_frame");
    const carried = savedByIndex.get(hashKey(`${day.slot}:reel_video`));
    return {
      date: p.date as string,
      planId: p.id as string,
      existingReelSlot: video ? "reel_video" : null,
      currentStatus: video?.status ?? null,
      mediaId: video?.id ?? null,
      startFrameMediaId: frame?.id ?? null,
      storyDayId: p.story_day_id as string | null,
      recoveryIndex: day.slot,
      recoveryDirection: day.direction,
      targetDurationSec: day.compiled.durationSec,
      assetCarried: !!carried,
      assetOriginMediaId: carried?.origin_media_id ?? null,
    };
  });

  if (blocked.length > 0) {
    return NextResponse.json(
      { success: false, stopped: true, reason: "stop conditions triggered — no DB write performed", blocked, report },
      { status: 409 }
    );
  }

  // Fewer calendar slots than recovery reels is NOT an error — it is the normal state when the
  // story engine has not run far enough ahead yet. Map what exists; the rest stay pending and a
  // later re-run picks them up, because this route is idempotent. Inventing a plan to fill the gap
  // is the one thing it must not do.
  const pendingRecoveryIndexes = days.slice(targets.length).map((d) => d.slot);

  const orphanReport = orphanRecoveryPlans.map((p) => ({
    date: p.date as string,
    planId: p.id as string,
    action: "retire — asset carried to a real calendar slot, plan and its media rows removed",
    mediaIds: (mediaByPlan.get(p.id as string) ?? []).map((m) => m.id),
  }));

  if (!apply) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      fromDate,
      report,
      pendingRecoveryIndexes,
      orphans: orphanReport,
      note: "no DB write — pass apply:true",
    });
  }

  // ── 5. write ──────────────────────────────────────────────────────────────
  for (let i = 0; i < targets.length; i++) {
    const plan = targets[i];
    const day = days[i];
    const rows = mediaByPlan.get(plan.id as string) ?? [];

    const marker = {
      recovery_sprint: true,
      recovery_index: day.slot,
      recovery_total: days.length,
      recovery_version: RECOVERY_VERSION,
      direction: day.direction,
      objective: day.objective,
      // Kept under the same key the generation path already reads, so routing keeps working.
      slot: day.slot,
      target_duration_sec: day.compiled.durationSec,
      compiler: "simpleReelCompiler",
      integrated_at: new Date().toISOString(),
    };

    // plan marker — MERGED, so nothing already in content_mix is lost
    const mergedMix = { ...((plan.content_mix as Record<string, unknown>) ?? {}), recovery: marker };
    const { error: mixErr } = await supabase.from("chs_daily_plans").update({ content_mix: mergedMix }).eq("id", plan.id);
    if (mixErr) return NextResponse.json({ error: `plan ${plan.date}: ${mixErr.message}` }, { status: 500 });

    const startFramePrompt = compileRecoveryStartFrame({
      sceneBrief: day.brief,
      framing: day.compiled.framing,
      openingState: day.firestarter ? "close to the lens, looking away to one side" : undefined,
    });

    const specs = [
      { slot: "reel_start_frame", prompt: startFramePrompt, directorModel: "soul2", negativePrompt: START_FRAME_FRAMING_NEGATIVES },
      { slot: "reel_video", prompt: day.compiled.prompt, directorModel: "recovery", negativePrompt: undefined as string | undefined },
    ];

    for (const spec of specs) {
      const row = rows.find((m) => m.slot === spec.slot);
      if (!row) continue; // never create a slot the calendar does not have
      const carried = savedByIndex.get(hashKey(`${day.slot}:${spec.slot}`));

      const visual_signature: Record<string, unknown> = {
        ...((row.visual_signature as Record<string, unknown>) ?? {}),
        recovery: {
          ...marker,
          ...(spec.negativePrompt ? { negative_prompt: spec.negativePrompt } : {}),
          ...(carried && carried.origin_media_id !== row.id ? { asset_origin_media_id: carried.origin_media_id } : {}),
        },
        prompt_director: { model: spec.directorModel },
        ...(carried?.provenance ? { provider_provenance: carried.provenance } : {}),
      };

      const update: Record<string, unknown> = {
        higgsfield_prompt: spec.prompt,
        visual_signature,
        last_error: null,
      };

      if (carried) {
        // Recovery #1 is already rendered and approved by eye — carry it, never regenerate it.
        update.media_url = carried.media_url;
        update.source_url = carried.source_url;
        update.status = carried.status;
        update.generation_status = carried.generation_status;
      } else {
        // Everything else is PLANNED, not generated: it waits for the normal approval action.
        update.media_url = null;
        update.source_url = null;
        update.status = "pending";
        update.generation_status = "completed"; // "prompt ready" — the meaning dailyBatch gives it
      }

      const { error } = await supabase.from("chs_media").update(update).eq("id", row.id);
      if (error) return NextResponse.json({ error: `${plan.date} ${spec.slot}: ${error.message}` }, { status: 500 });
    }
  }

  // ── 6. retire orphan recovery plans, AFTER their assets have been carried ──
  // Deliberately last: if anything above failed we returned early and the orphan still holds the
  // only copy. Guarded again here rather than trusted — a delete that runs before the carry would
  // lose the one asset that must never be regenerated.
  const retired: string[] = [];
  for (const orphan of orphanRecoveryPlans) {
    const rows = mediaByPlan.get(orphan.id as string) ?? [];
    const stillUniqueAsset = rows.some((m) => {
      if (!m.media_url) return false;
      return !media.some((other) => other.id !== m.id && other.batch_id !== orphan.id && other.media_url === m.media_url);
    });
    if (stillUniqueAsset) {
      // Re-read: the carry above should have copied it. If it did not, keep the plan and say so.
      const { data: fresh } = await supabase
        .from("chs_media")
        .select("id, media_url")
        .in("batch_id", targets.map((t) => t.id as string));
      const carriedUrls = new Set((fresh ?? []).map((f) => f.media_url).filter(Boolean));
      const unsafe = rows.some((m) => m.media_url && !carriedUrls.has(m.media_url));
      if (unsafe) {
        retired.push(`${orphan.date}: KEPT — its asset was not found on any target slot, refusing to delete`);
        continue;
      }
    }
    const { error: delMediaErr } = await supabase.from("chs_media").delete().eq("batch_id", orphan.id);
    if (delMediaErr) return NextResponse.json({ error: `orphan media ${orphan.date}: ${delMediaErr.message}` }, { status: 500 });
    const { error: delPlanErr } = await supabase.from("chs_daily_plans").delete().eq("id", orphan.id);
    if (delPlanErr) return NextResponse.json({ error: `orphan plan ${orphan.date}: ${delPlanErr.message}` }, { status: 500 });
    retired.push(`${orphan.date}: retired (plan + ${rows.length} media rows)`);
  }

  return NextResponse.json({
    success: true,
    applied: true,
    fromDate,
    report,
    pendingRecoveryIndexes,
    retiredOrphans: retired,
    note: "Recovery reels are now ordinary calendar reel slots. Approve them in /review exactly like any other day; generation, QA and publishing all run through the existing flow.",
  });
}

// Small stable key so an index+slot pair can address a saved asset without a nested map.
function hashKey(k: string): number {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return h;
}

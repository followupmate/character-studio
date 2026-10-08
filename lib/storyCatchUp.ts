// Phase 6 (batch reliability) — self-healing for a missing daily story day.
//
// Root cause it addresses: chs_story_days is created ONLY by the Vercel cron `0 6 * * *`
// (vercel.json -> GET /api/characters/story). On Hobby that cron fires once per day somewhere in
// the 06:00-06:59 UTC hour (observed 06:57-07:02 UTC from created_at) and is never retried. If
// that single run fails before the insert (LLM error / truncated JSON / the 300 s function limit
// hit during the arc planner + up to 4 Sonnet attempts), the day simply never exists. The
// cron-job.org 15-minute job only calls /api/publish/cron (publish + from-batch sweep), which never
// creates a story day — so nothing heals it until someone runs generate-forward by hand.
//
// Fix: on cron-job.org's /api/publish/cron tick, inside a bounded morning window, if an active
// character has no chs_story_days row for today's story date, fire GET /api/characters/story once
// (fire-and-forget; that route has its own 300 s invocation and is idempotent per character/date).
// Kill switch: STORY_CATCHUP_DISABLED=true.

import { supabase } from "@/lib/supabase";

/** Same date the story route uses (`new Date().toISOString().split("T")[0]`), i.e. the UTC date. */
export function storyDateUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Window in UTC minutes-of-day. Starts after the Vercel cron hour + its 300 s limit (06:00-07:05),
// ends early enough for the day's posts (story 11:00 / reel 17:30 Europe/Bratislava). In this
// window the UTC date and the Europe/Bratislava date are always the same day (no tz boundary).
export const STORY_CATCHUP_START_MIN = 7 * 60 + 15; // 07:15 UTC
export const STORY_CATCHUP_END_MIN = 13 * 60; // 13:00 UTC (exclusive)
// cron-job.org ticks every 15 min; only every 2nd tick may trigger (max ~12 attempts/day), and a
// story run (<= 300 s) always finishes before the next eligible tick, so runs never overlap.
export const STORY_CATCHUP_EVERY_MIN = 30;

export function inStoryCatchUpWindow(now: Date): boolean {
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (m < STORY_CATCHUP_START_MIN || m >= STORY_CATCHUP_END_MIN) return false;
  // eligible only on the first tick of each 30-minute bucket (minute 0-14 of :00 / :30)
  return now.getUTCMinutes() % STORY_CATCHUP_EVERY_MIN < 15;
}

export function storyCatchUpDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.STORY_CATCHUP_DISABLED ?? "").toLowerCase() === "true";
}

/** Names of active characters without a chs_story_days row for `date`. */
export async function charactersMissingStoryDay(date: string): Promise<string[]> {
  const { data: chars, error } = await supabase.from("chs_characters").select("id, name").eq("is_active", true);
  if (error) throw error;
  const list = (chars ?? []) as Array<{ id: string; name: string }>;
  if (list.length === 0) return [];
  const { data: days, error: dErr } = await supabase
    .from("chs_story_days")
    .select("character_id")
    .eq("date", date)
    .in("character_id", list.map((c) => c.id));
  if (dErr) throw dErr;
  const have = new Set(((days ?? []) as Array<{ character_id: string }>).map((d) => d.character_id));
  return list.filter((c) => !have.has(c.id)).map((c) => c.name);
}

export interface StoryCatchUpResult {
  triggered: boolean;
  reason: string;
  date: string;
  missing?: string[];
}

export interface StoryCatchUpDeps {
  now?: Date;
  env?: Record<string, string | undefined>;
  findMissing?: (date: string) => Promise<string[]>;
  /** Dispatches the story run. Must not wait for it to finish (cron-job.org times out at 30 s). */
  fire?: (url: string, headers: Record<string, string>) => Promise<void>;
}

const FIRE_TIMEOUT_MS = 2500;

async function defaultFire(url: string, headers: Record<string, string>): Promise<void> {
  // Vercel does not cancel a function when its caller disconnects (cancellation is opt-in), so the
  // story invocation keeps running for its own maxDuration after this short client-side abort.
  try {
    await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(FIRE_TIMEOUT_MS) });
  } catch {
    /* timeout/abort is the expected outcome — the run continues server-side */
  }
}

export async function maybeTriggerStoryCatchUp(origin: string, deps: StoryCatchUpDeps = {}): Promise<StoryCatchUpResult> {
  const now = deps.now ?? new Date();
  const date = storyDateUtc(now);
  if (storyCatchUpDisabled(deps.env ?? process.env)) return { triggered: false, reason: "disabled", date };
  if (!inStoryCatchUpWindow(now)) return { triggered: false, reason: "outside window", date };

  const missing = await (deps.findMissing ?? charactersMissingStoryDay)(date);
  if (missing.length === 0) return { triggered: false, reason: "story day exists", date, missing };

  const env = deps.env ?? process.env;
  const headers: Record<string, string> = env.CRON_SECRET ? { Authorization: `Bearer ${env.CRON_SECRET}` } : {};
  console.warn(`[story-catchup] no story day for ${date} (${missing.join(", ")}) — triggering /api/characters/story`);
  await (deps.fire ?? defaultFire)(`${origin}/api/characters/story`, headers);
  return { triggered: true, reason: "missing story day", date, missing };
}

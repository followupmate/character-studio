import { supabase } from "@/lib/supabase";

// LIFE LAYER (v1.1, flag: life_layer) — gives the persona a persistent, evolving day-to-day state so it
// reads like a continuing life, not a series of pretty scenes. Stored as jsonb on chs_story_days.life_state
// (no new table). Multi-day arcs live in chs_life_events. Used as GUIDANCE only — never overrides tier.
//
// Design note: the rich life_state for "today" is emitted by the SAME story LLM call (no extra call) via
// LIFE_OUTPUT_SPEC; this module only reads the previous state for continuity, formats the context block,
// and spawns occasional small events from a deck (no LLM, biased to everyday — not a telenovela).

export interface LifeState {
  mood_state?: string;
  energy_level?: number;
  confidence_level?: number;
  social_level?: number;
  body_focus?: number;
  romantic_tension?: number;
  work_pressure?: number;
  current_city?: string;
  current_place_type?: string;
  recent_event?: string;
  unresolved_thread?: string;
  next_possible_shift?: string;
}

export interface LifeEvent {
  event_type: string;
  title: string;
  description?: string | null;
  emotional_weight: number;
  starts_at: string;
  ends_at?: string | null;
  status: string;
}

// The previous day's persisted life_state (most recent non-null before `beforeDate`, or overall latest).
export async function getLatestLifeState(characterId: string, beforeDate?: string): Promise<LifeState | null> {
  let q = supabase
    .from("chs_story_days")
    .select("date, life_state")
    .eq("character_id", characterId)
    .not("life_state", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  if (beforeDate) q = q.lt("date", beforeDate);
  const { data } = await q;
  const row = (data ?? [])[0] as { life_state: LifeState | null } | undefined;
  return row?.life_state ?? null;
}

// Events that are active on `date` (started, not yet ended).
export async function getActiveLifeEvents(characterId: string, date: string): Promise<LifeEvent[]> {
  const { data } = await supabase
    .from("chs_life_events")
    .select("event_type, title, description, emotional_weight, starts_at, ends_at, status")
    .eq("character_id", characterId)
    .eq("status", "active")
    .lte("starts_at", date)
    .or(`ends_at.is.null,ends_at.gte.${date}`)
    .order("starts_at", { ascending: false });
  return (data ?? []) as LifeEvent[];
}

// Context block injected into the story system prompt (continuity guidance, not a hard rule).
export function lifeContextBlock(prev: LifeState | null, events: LifeEvent[]): string {
  if (!prev && events.length === 0) return "";
  const lines: string[] = [];
  lines.push("LIFE STATE (continuity context — let it COLOR today's mood/energy; never contradict the tier above):");
  if (prev) {
    const nums = [
      prev.energy_level != null ? `energy ${prev.energy_level}/10` : null,
      prev.social_level != null ? `social ${prev.social_level}/10` : null,
      prev.body_focus != null ? `body-focus ${prev.body_focus}/10` : null,
      prev.romantic_tension != null ? `romantic-tension ${prev.romantic_tension}/10` : null,
    ].filter(Boolean).join(", ");
    if (prev.mood_state) lines.push(`- yesterday's mood: ${prev.mood_state}${nums ? ` (${nums})` : ""}`);
    else if (nums) lines.push(`- yesterday: ${nums}`);
    if (prev.current_city) lines.push(`- where she is: ${prev.current_city}${prev.current_place_type ? ` (${prev.current_place_type})` : ""}`);
    if (prev.recent_event) lines.push(`- recent event: ${prev.recent_event}`);
    if (prev.unresolved_thread) lines.push(`- unresolved thread (you may continue or resolve it): ${prev.unresolved_thread}`);
    if (prev.next_possible_shift) lines.push(`- a shift she hinted at: ${prev.next_possible_shift}`);
  }
  if (events.length > 0) {
    lines.push(`- active life events today: ${events.map((e) => e.title).join("; ")}`);
  }
  lines.push("RULE: evolve naturally from yesterday — small day-to-day change, real life. Don't reset to a blank slate, don't manufacture drama.");
  return lines.join("\n");
}

// Appended to the story OUTPUT FORMAT only when life_layer is on — the same LLM call emits today's state.
export const LIFE_OUTPUT_SPEC = `- life_state: object capturing the evolving state of her life AFTER today (continuity for tomorrow). Keys:
    {
      "mood_state": "1 to 4 words, today's felt mood (e.g. 'easy and rested', 'a little restless')",
      "energy_level": 1-10, "confidence_level": 1-10, "social_level": 1-10,
      "body_focus": 1-10, "romantic_tension": 1-10, "work_pressure": 1-10,
      "current_city": "the city/town she is in today", "current_place_type": "home | gym | cafe | hotel | outdoors | studio | other",
      "recent_event": "one short clause — the small thing that happened today",
      "unresolved_thread": "OPTIONAL one short clause left open for a future day, or null",
      "next_possible_shift": "one short clause hinting where tomorrow could go"
    }
    Evolve numbers GENTLY from yesterday's life state (±1–2 typically). Keep it everyday and grounded.`;

// ── Event deck (no LLM) — biased to small everyday beats; dramatic ones are rare. ──────────────
interface EventDeckItem { event_type: string; title: string; weight: number; days: number; rare?: boolean }
const EVENT_DECK: EventDeckItem[] = [
  { event_type: "slow_morning", title: "a slow, unplanned morning", weight: 2, days: 1 },
  { event_type: "coffee_with_friend", title: "coffee with a friend", weight: 3, days: 1 },
  { event_type: "gym_reset", title: "back to the gym after a lazy stretch", weight: 3, days: 1 },
  { event_type: "errand_run", title: "a day of errands around the city", weight: 2, days: 1 },
  { event_type: "quiet_night_in", title: "a quiet night in", weight: 2, days: 1 },
  { event_type: "new_recipe", title: "trying something new in the kitchen", weight: 2, days: 1 },
  { event_type: "self_care_day", title: "a slow self-care day", weight: 3, days: 1 },
  { event_type: "rainy_day_in", title: "a rainy day spent inside", weight: 2, days: 1 },
  { event_type: "good_news", title: "a small piece of good news", weight: 4, days: 1 },
  { event_type: "friend_stayover", title: "a friend stays over", weight: 4, days: 2 },
  // rare / bigger — low cumulative probability
  { event_type: "weekend_trip", title: "a short weekend trip", weight: 6, days: 3, rare: true },
  { event_type: "celebration", title: "a little celebration", weight: 7, days: 1, rare: true },
  { event_type: "off_day", title: "an off day, low energy", weight: 5, days: 1, rare: true },
];

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

// Occasionally spawn a new small life event (every ~3–5 days, mostly everyday/low-weight).
export async function maybeCreateLifeEvent(args: { characterId: string; date: string }): Promise<LifeEvent | null> {
  const { characterId, date } = args;
  const { data: last } = await supabase
    .from("chs_life_events")
    .select("starts_at")
    .eq("character_id", characterId)
    .order("starts_at", { ascending: false })
    .limit(1);
  const lastStart = (last ?? [])[0]?.starts_at as string | undefined;
  const daysSince = lastStart
    ? Math.round((new Date(date).getTime() - new Date(lastStart).getTime()) / 86400000)
    : 99;
  if (daysSince < 3) return null; // never two arcs back-to-back

  const gate = daysSince >= 5 ? 0.8 : daysSince === 4 ? 0.5 : 0.3;
  if (Math.random() > gate) return null;

  // 85% everyday, 15% rare/bigger.
  const pool = Math.random() < 0.85 ? EVENT_DECK.filter((e) => !e.rare) : EVENT_DECK.filter((e) => e.rare);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const ends_at = pick.days > 1 ? addDays(date, pick.days - 1) : null;

  const { data, error } = await supabase
    .from("chs_life_events")
    .insert({
      character_id: characterId,
      event_type: pick.event_type,
      title: pick.title,
      emotional_weight: pick.weight,
      starts_at: date,
      ends_at,
      status: "active",
    })
    .select("event_type, title, description, emotional_weight, starts_at, ends_at, status")
    .single();
  if (error) return null;
  return data as LifeEvent;
}

import { supabase } from "@/lib/supabase";
import { claudeWithRetry } from "@/lib/generatePrompts";
import { Character } from "@/types";

// Arc types match the CHECK constraint in chs_arcs table
export type ArcType = "trip" | "home_interlude" | "city_event" | "visitor" | "project";
export type ArcStatus = "planned" | "active" | "done" | "cancelled";
export type ArcPhase =
  | "anticipation" | "travel" | "arrival" | "exploration" | "peak" | "departure" | "aftermath"
  | "setup" | "build";

export interface DayPlanItem {
  day_index: number;
  phase: ArcPhase;
  focus: string;
  location_hint: string;
}

export interface Arc {
  id: string;
  character_id: string;
  arc_type: ArcType;
  title: string;
  premise: string;
  city: string;
  start_date: string;
  end_date: string;
  day_plan: DayPlanItem[];
  fanvue_hook?: string;
  status: ArcStatus;
  tracking_link_url?: string;
  created_at: string;
}

export interface ArcDayContext {
  phase: ArcPhase;
  dayIndex: number;
  dayCount: number;
  focus: string;
  city: string;
  locationHint: string;
  isLastDay: boolean;
}

// Get the active arc (planned or active) covering a specific date
export async function getActiveArc(characterId: string, date: string): Promise<Arc | null> {
  const { data } = await supabase
    .from("chs_arcs")
    .select("*")
    .eq("character_id", characterId)
    .in("status", ["planned", "active"])
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // If arc is planned and date >= start_date, transition to active
  if (data.status === "planned") {
    const { data: updated } = await supabase
      .from("chs_arcs")
      .update({ status: "active" })
      .eq("id", data.id)
      .select()
      .single();
    return updated as Arc;
  }

  return data as Arc;
}

// Pure: compute day context (phase, index, count, focus) for a given arc and date
export function getArcDayContext(arc: Arc, date: string): ArcDayContext | null {
  const startDate = new Date(arc.start_date + "T00:00:00Z");
  const targetDate = new Date(date + "T00:00:00Z");
  const endDate = new Date(arc.end_date + "T00:00:00Z");

  const dayIndex = Math.floor((targetDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const dayCount = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (dayIndex < 0 || dayIndex >= dayCount) return null;

  const dayPlan = arc.day_plan.find((d) => d.day_index === dayIndex);
  if (!dayPlan) return null;

  return {
    phase: dayPlan.phase,
    dayIndex: dayIndex + 1, // 1-indexed for display
    dayCount,
    focus: dayPlan.focus,
    city: arc.city,
    locationHint: dayPlan.location_hint,
    isLastDay: dayIndex === dayCount - 1,
  };
}

// Pure: format arc context block for the story system prompt
export function arcContextBlock(ctx: ArcDayContext, arc: Arc): string {
  return `ARC CONTEXT (today is day ${ctx.dayIndex}/${ctx.dayCount} of "${arc.title}" — ${arc.premise}):
- phase today: ${ctx.phase} — ${ctx.focus}
- city (MANDATORY — the story MUST take place here): ${ctx.city}
- location hint: ${ctx.locationHint}
- yesterday's unresolved thread belongs to this arc — continue it, don't reset.

RULE: life_state.current_city MUST equal "${ctx.city}". The day's location must be a concrete
micro-location inside this city/phase (arrival day → station/airport/hotel check-in energy;
aftermath → home, physical traces of the trip visible).`;
}

// Pure: validate an arc plan against previous arcs
export function validateArcPlan(
  arc: Arc,
  previousArcs: Arc[]
): string[] {
  const errors: string[] = [];

  // Rule 1: after trip, must be home_interlude
  if (previousArcs.length > 0) {
    const lastArc = previousArcs[0];
    if (lastArc.arc_type === "trip" && arc.arc_type !== "home_interlude") {
      errors.push("After a trip arc, must plan a home_interlude");
    }
  }

  // Rule 2: max 1 trip per ~10 days
  const arcDays = Math.floor(
    (new Date(arc.end_date + "T00:00:00Z").getTime() -
     new Date(arc.start_date + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;

  if (arc.arc_type === "trip") {
    const tripCount = previousArcs.filter((a) => a.arc_type === "trip").length;
    if (tripCount > 0) {
      const daysSinceLast = Math.floor(
        (new Date(arc.start_date + "T00:00:00Z").getTime() -
         new Date(previousArcs[0].end_date + "T00:00:00Z").getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceLast < 10) {
        errors.push(`Only ${daysSinceLast} days since last trip; need ≥10 days between trips`);
      }
    }
    if (arcDays > 5) {
      errors.push("Trip arcs should be 3–5 days; this is too long");
    }
  }

  // Rule 3: never 3× same arc_type in a row
  if (previousArcs.length >= 2 && previousArcs[0].arc_type === previousArcs[1].arc_type && previousArcs[0].arc_type === arc.arc_type) {
    errors.push(`Cannot have 3 consecutive ${arc.arc_type} arcs`);
  }

  // Rule 4: city constraints
  if (arc.arc_type === "home_interlude" && arc.city !== "Barcelona") {
    errors.push("Home interlude must be in Barcelona");
  }
  if (arc.arc_type === "trip" && arc.city === "Barcelona") {
    errors.push("Trip arcs should be to cities other than Barcelona (home)");
  }

  // Rule 5: date sanity
  if (arc.start_date > arc.end_date) {
    errors.push("start_date must be ≤ end_date");
  }

  // Rule 6: day_plan length must match arc duration
  if (arc.day_plan.length !== arcDays) {
    errors.push(`day_plan length (${arc.day_plan.length}) must match arc duration (${arcDays} days)`);
  }

  return errors;
}

// Fetch previous arcs (last 3, most recent first) for panning context
async function getPreviousArcs(characterId: string, beforeDate?: string): Promise<Arc[]> {
  let q = supabase
    .from("chs_arcs")
    .select("*")
    .eq("character_id", characterId)
    .in("status", ["done", "active"])
    .order("end_date", { ascending: false })
    .limit(3);

  if (beforeDate) q = q.lt("end_date", beforeDate);

  const { data } = await q;
  return (data ?? []) as Arc[];
}

// Claude call to generate the next arc
async function generateNextArc(
  character: Character,
  previousArcs: Arc[],
  today: string
): Promise<Arc> {
  const ARC_CITY_POOL: Record<string, string[]> = {
    tier_a: [
      "Paris",
      "Amalfi",
      "Positano",
      "Lisbon",
      "Santorini",
      "Monaco",
      "Milan",
      "Rome",
      "Barcelona",
      "Dubrovnik",
    ],
    tier_b: ["Mykonos", "Porto", "Florence", "Nice", "Capri", "Valletta", "Split"],
  };

  const currentSeason = new Date().getMonth() < 6 ? "spring" : new Date().getMonth() < 9 ? "summer" : "fall";

  const previousArcsText =
    previousArcs.length > 0
      ? previousArcs
          .map(
            (a) =>
              `${a.arc_type} to ${a.city} (${a.start_date} - ${a.end_date}): ${a.premise}`
          )
          .join("\n")
      : "No previous arcs.";

  const arcRhythmRules = `
MANDATORY ARC RHYTHM:
- After a "trip" arc, the next arc MUST be "home_interlude" (Barcelona, 2–4 days).
- Never 2 trips in a row. Never 3 same arc_type in a row.
- Max 1 trip per ~10 days. Trip duration: 3–5 days. Home interlude: 2–4 days.
- New cities: rotate every 3–4 weeks for repeat cities (Lisbon, Amalfi, Paris).
- Striation: balance trip/home/event/visitor/project types.`;

  const prompt = `You are planning the next narrative arc for Vivienne, a Barcelona-based luxury traveller whose life runs in rhythms of home and movement.

CHARACTER BACKSTORY:
${character.backstory}

PERSONALITY:
${JSON.stringify(character.personality ?? {}, null, 2)}

ARC RHYTHM RULES:
${arcRhythmRules}

PREVIOUS ARCS (most recent first):
${previousArcsText}

TODAY'S DATE: ${today}
CURRENT SEASON: ${currentSeason}

AVAILABLE CITIES:
Tier A (high quality): ${ARC_CITY_POOL.tier_a.join(", ")}
Tier B (good): ${ARC_CITY_POOL.tier_b.join(", ")}
Always: Barcelona (home)

OUTPUT: Return a JSON object (valid JSON only, no markdown) with:
{
  "arc_type": one of "trip" | "home_interlude" | "city_event" | "visitor" | "project",
  "title": string, e.g. "Three days in Lisbon" or "The bedroom project",
  "premise": string, 1–2 sentences explaining why this arc and what happens,
  "city": string, e.g. "Lisbon" or "Barcelona",
  "start_date": ISO date (YYYY-MM-DD) — earliest 2–3 days from today,
  "end_date": ISO date (YYYY-MM-DD) — end of arc,
  "day_plan": array of objects, one per day:
    [
      {
        "day_index": 0 (first day),
        "phase": one of "anticipation" | "travel" | "arrival" | "exploration" | "peak" | "departure" | "aftermath" | "setup" | "build",
        "focus": string, one sentence describing the day's theme (e.g. "packing and anticipation", "arrival and first exploration"),
        "location_hint": string, specific micro-location (e.g. "hotel check-in desk", "Lisbon's Alfama district", "Barcelona apartment terrace")
      },
      ...
    ],
  "fanvue_hook": string or null, one sentence of private continuation for peak/aftermath day (e.g. "the rest of that night, off the boat deck"),
  "rationale": string, brief explanation of why this arc works next
}`;

  const systemPrompt = "You are a narrative planner for a luxury lifestyle character. Generate coherent, data-respecting arc plans.";

  const response = await claudeWithRetry({
    model: "claude-opus-4-1-20250805",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText =
    response.content?.[0]?.type === "text" ? response.content[0].text : "";
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(jsonText);

  const arcData: Arc = {
    id: crypto.randomUUID?.() || `arc-${Date.now()}`,
    character_id: character.id,
    arc_type: parsed.arc_type,
    title: parsed.title,
    premise: parsed.premise,
    city: parsed.city,
    start_date: parsed.start_date,
    end_date: parsed.end_date,
    day_plan: parsed.day_plan,
    fanvue_hook: parsed.fanvue_hook || null,
    status: "planned",
    created_at: new Date().toISOString(),
  };

  const errors = validateArcPlan(arcData, previousArcs);
  if (errors.length > 0) {
    throw new Error(`Arc validation failed:\n${errors.join("\n")}`);
  }

  return arcData;
}

// Auto-plan the next arc if none exists for date+2 days
export async function maybeAutoPlanArc(
  characterId: string,
  date: string
): Promise<Arc | null> {
  // Check if an arc covers date+2
  const checkDate = new Date(date + "T00:00:00Z");
  checkDate.setUTCDate(checkDate.getUTCDate() + 2);
  const checkDateStr = checkDate.toISOString().split("T")[0];

  const { data: existingArc } = await supabase
    .from("chs_arcs")
    .select("id")
    .eq("character_id", characterId)
    .lte("start_date", checkDateStr)
    .gte("end_date", checkDateStr)
    .limit(1)
    .maybeSingle();

  if (existingArc) return null; // Arc already exists

  // Fetch character and previous arcs
  const { data: character } = await supabase
    .from("chs_characters")
    .select("*")
    .eq("id", characterId)
    .single();

  if (!character) throw new Error(`Character ${characterId} not found`);

  const previousArcs = await getPreviousArcs(characterId, checkDateStr);

  // Generate and insert new arc
  const newArc = await generateNextArc(character as Character, previousArcs, date);

  const { data: inserted } = await supabase
    .from("chs_arcs")
    .insert(newArc)
    .select()
    .single();

  return (inserted as Arc) || null;
}

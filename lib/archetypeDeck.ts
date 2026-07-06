import { supabase } from "@/lib/supabase";

export type ArchetypeFamily = "environment" | "subject" | "detail" | "motion" | "bts";
export type SlotChannel = "feed" | "reel" | "story";

export interface Archetype {
  id: string;
  family: ArchetypeFamily;
  guidance: string;
  feed_cooldown: number;
  reel_cooldown: number;
  story_cooldown: number;
  weight: number;
}

export type SlotName =
  | "carousel_1"
  | "carousel_2"
  | "carousel_3"
  | "carousel_4"
  | "carousel_5"
  | "reel_start_frame"
  | "reel_video"
  | "story_bts";

export interface SlotSpec {
  slot: SlotName;
  channel: SlotChannel;
  type: "photo" | "video";
  sequence_index: number | null;
  family: ArchetypeFamily;
  preferred_archetypes?: string[];
  excluded_archetypes?: string[];
  framing: string;
}

export const DAILY_SLOTS: SlotSpec[] = [
  {
    slot: "carousel_1",
    channel: "feed",
    type: "photo",
    sequence_index: 1,
    family: "environment",
    framing: "Wide establishing frame. Subject embedded in environment, not centered. Reads as the opening line of a visual sentence — what the day looks like before she enters it.",
  },
  {
    slot: "carousel_2",
    channel: "feed",
    type: "photo",
    sequence_index: 2,
    family: "subject",
    excluded_archetypes: ["over_shoulder"],
    framing: "Mid shot. Subject in the space established by carousel_1. Same light, same wardrobe, continuity locked. Reads as the second beat — she has entered the scene.",
  },
  {
    slot: "carousel_3",
    channel: "feed",
    type: "photo",
    sequence_index: 3,
    family: "detail",
    excluded_archetypes: ["emotional_close"],
    framing: "Close detail — hands, fabric, object, surface. Face out of frame. Reads as the texture beat: the material reality of the scene.",
  },
  {
    slot: "carousel_4",
    channel: "feed",
    type: "photo",
    sequence_index: 4,
    family: "subject",
    preferred_archetypes: ["over_shoulder", "interaction_object"],
    framing: "Reverse or over-shoulder angle. Shifts perspective from observer to participant. Maintains same light, wardrobe, location.",
  },
  {
    slot: "carousel_5",
    channel: "feed",
    type: "photo",
    sequence_index: 5,
    family: "detail",
    preferred_archetypes: ["emotional_close"],
    framing: "Emotional close on face — eyes, mouth, micro-expression. Reads as the punchline of the visual sentence. The viewer leaves with this image.",
  },
  {
    slot: "reel_start_frame",
    channel: "reel",
    type: "photo",
    sequence_index: null,
    family: "subject",
    framing: "First frame of the 9:16 vertical reel — fed to image-to-video (Kling / Seedance). Same scene, light, wardrobe as carousel. Subject anchored in the pose the motion continues from — caught mid-action, mid-pose. CRITICAL: her FACE MUST be clearly visible and turned toward camera (at least head-and-shoulders in frame, eyes visible) — this frame is the identity anchor the video animates from; a cropped, headless, profile or face-away frame forces the video model to invent a different face (loses Vivienne). Leave room for the reel_video motion. Vertical 9:16.",
  },
  {
    slot: "reel_video",
    channel: "reel",
    type: "video",
    sequence_index: null,
    family: "motion",
    framing: "5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.",
  },
  {
    slot: "story_bts",
    channel: "story",
    type: "photo",
    sequence_index: null,
    family: "bts",
    framing: "Behind-the-scenes moment from the day's process. 9:16 vertical. Phone-camera realism allowed. Lower production polish than feed; this is the human layer.",
  },
];

// DISCOVERY MODE (flag: discovery_mode) — REEL-ONLY growth batch, data-driven.
// This account's own numbers: carousels avg ~4 views (dead — the algorithm does
// not push them), reels ~72 views but 0 shares/saves (they hit the initial test
// audience and stop). And because reels are auto-published via the IG API, they
// CANNOT use trending/licensed audio (API limitation) — so reach can't come from
// music. The only remaining reach levers the engine controls are WATCH-TIME,
// SEAMLESS LOOP and SHARE/SAVE-worthiness. So discovery drops the whole carousel
// and ships a retention-engineered reel + a story, concentrating everything on
// the one surface that gets any reach.
const DISCOVERY_FRAMING: Partial<Record<SlotName, string>> = {
  reel_start_frame:
    "REEL COVER + first frame + identity anchor. This must STOP THE SCROLL and hold the eye long enough to start watch-time — and it does that with the IMAGE, not with drawn text. Build the stop-scroll from a magnetic forward-facing expression, a strong single focal point, high contrast and no clutter. Face clearly FORWARD, eyes to camera, one expressive micro-moment. Leave deliberate CLEAN EMPTY NEGATIVE SPACE in the top third where a bold text hook is added LATER as a real overlay in the editor. Do NOT render any text, letters, words or captions in the image — AI image generators produce garbled scribble, which kills the frame. Vertical 9:16. (Critical: face forward and clearly visible — a cropped/headless/face-away frame makes the video model invent a new face and loses the identity.)",
  reel_video:
    "RETENTION-ENGINEERED LOOP — reach here comes ONLY from watch-time + rewatches + shares (no trending audio available on API-published reels). Rules: (1) keep clean empty negative space in the top third where the text hook overlay will sit — do NOT render any text, letters or words in the video itself (generators scribble). (2) SHORT — 5 to 6 seconds, no filler; every frame earns its place. (3) A 'wait-for-it' PAYOFF beat around 2–4s: a small reveal, a change, a satisfying motion that rewards staying and makes a viewer rewatch to catch it. (4) SEAMLESS LOOP — the final frame must match the first frame's pose/composition so it loops invisibly and racks up repeat views. (5) Face toward camera throughout (no turn-away / pan-off / push-to-wide, or the model invents a new face). Immediately readable, single clean action — a cold viewer must 'get it' in ~2 seconds.",
};

// In discovery mode the entire carousel is dropped (data: ~4 views, no reach).
const DISCOVERY_DROP: Set<SlotName> = new Set([
  "carousel_1", "carousel_2", "carousel_3", "carousel_4", "carousel_5",
]);

// Returns the daily deck. Discovery mode = reel-only growth batch: drop the
// carousel and swap in retention-engineered reel framing. `reelFormat`, when
// given, layers a proven short-form format (POV / wait-for-it / GRWM …) onto the
// reel so every day has a deliberate retention shape, not a generic pretty clip.
export function dailySlots(
  discoveryMode = false,
  reelFormat?: { label: string; coverCue: string; videoDirective: string }
): SlotSpec[] {
  if (!discoveryMode) return DAILY_SLOTS;
  return DAILY_SLOTS
    .filter((s) => !DISCOVERY_DROP.has(s.slot))
    .map((s) => {
      let framing = DISCOVERY_FRAMING[s.slot] ?? s.framing;
      if (reelFormat) {
        if (s.slot === "reel_start_frame") framing += ` FORMAT — ${reelFormat.label}: ${reelFormat.coverCue}`;
        else if (s.slot === "reel_video") framing += ` FORMAT — ${reelFormat.label}: ${reelFormat.videoDirective}`;
      }
      return framing === s.framing ? s : { ...s, framing };
    });
}

interface PickArgs {
  characterId: string;
  slots: SlotSpec[];
}

export async function pickArchetypesForBatch({ characterId, slots }: PickArgs): Promise<Record<SlotName, string>> {
  const { data: archetypes, error: archErr } = await supabase
    .from("chs_shot_archetypes")
    .select("*");

  if (archErr || !archetypes) throw archErr ?? new Error("Archetype deck empty");

  const { data: usage } = await supabase
    .from("chs_archetype_usage")
    .select("archetype_id, channel, used_at")
    .eq("character_id", characterId)
    .gte("used_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  const cooldownMap = new Map<string, number>();
  for (const u of usage ?? []) {
    const key = `${u.archetype_id}::${u.channel}`;
    const t = new Date(u.used_at).getTime();
    const prev = cooldownMap.get(key) ?? 0;
    if (t > prev) cooldownMap.set(key, t);
  }

  const now = Date.now();
  const isInCooldown = (arch: Archetype, channel: SlotChannel): boolean => {
    const cooldownDays =
      channel === "feed" ? arch.feed_cooldown :
      channel === "reel" ? arch.reel_cooldown :
      arch.story_cooldown;
    const lastUsed = cooldownMap.get(`${arch.id}::${channel}`);
    if (!lastUsed) return false;
    const ageMs = now - lastUsed;
    return ageMs < cooldownDays * 24 * 60 * 60 * 1000;
  };

  const selected: Record<string, string> = {};
  const usedThisBatch = new Set<string>();

  for (const slot of slots) {
    const familyMatches = (archetypes as Archetype[]).filter((a) => a.family === slot.family);

    const eligibleFiltered = familyMatches.filter((a) => {
      if (usedThisBatch.has(a.id)) return false;
      if (slot.excluded_archetypes?.includes(a.id)) return false;
      if (isInCooldown(a, slot.channel)) return false;
      return true;
    });

    let pool = eligibleFiltered;

    if (slot.preferred_archetypes) {
      const preferred = pool.filter((a) => slot.preferred_archetypes!.includes(a.id));
      if (preferred.length > 0) pool = preferred;
    }

    if (pool.length === 0) {
      pool = familyMatches.filter((a) => !usedThisBatch.has(a.id));
    }

    if (pool.length === 0) {
      pool = familyMatches;
    }

    const totalWeight = pool.reduce((sum, a) => sum + Math.max(1, a.weight), 0);
    let r = Math.random() * totalWeight;
    let chosen = pool[0];
    for (const a of pool) {
      r -= Math.max(1, a.weight);
      if (r <= 0) { chosen = a; break; }
    }

    selected[slot.slot] = chosen.id;
    usedThisBatch.add(chosen.id);
  }

  return selected as Record<SlotName, string>;
}

export async function logArchetypeUsage(args: {
  characterId: string;
  archetypeId: string;
  channel: SlotChannel;
  batchId: string;
}): Promise<void> {
  await supabase.from("chs_archetype_usage").insert({
    character_id: args.characterId,
    archetype_id: args.archetypeId,
    channel: args.channel,
    batch_id: args.batchId,
  });
}

export async function getArchetypeGuidance(id: string): Promise<string> {
  const { data } = await supabase
    .from("chs_shot_archetypes")
    .select("guidance")
    .eq("id", id)
    .single();
  return data?.guidance ?? "";
}

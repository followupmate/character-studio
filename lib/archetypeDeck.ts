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

// DISCOVERY MODE (flag: discovery_mode) — reel-hero + a tight 3-slide carousel
// for cold reach. Carousel drops from 5 → 3 (a wider 5-slide arc is depth for
// existing followers; a cold viewer needs hook → story → follow, fast). The
// reel becomes the visual hero. Discovery uses carousel_1/2/3 (contiguous, so
// from-batch's ordering and the 3-slide carousel script line up).
export const DISCOVERY_CAROUSEL_COUNT = 3;

const DISCOVERY_FRAMING: Partial<Record<SlotName, string>> = {
  carousel_1:
    "SLIDE 1 / HOOK — the first thing a stranger sees in the feed/grid; carries the hook_text overlay. NOT a slow empty establishing wide. Give an immediate reason to stop: subject present and engaging (face visible, looking toward or just past camera) OR one striking high-contrast hook composition. Bold, legible at thumbnail size, strong focal point. A cold viewer must get 'what is this' in under a second.",
  carousel_2:
    "SLIDE 2 / STORY — the sensory detail only someone there would know. Subject in the space, same light and wardrobe as slide 1 (continuity locked). Keeps the open loop from slide 1 alive; pulls the viewer to the last slide.",
  carousel_3:
    "SLIDE 3 / CLOSER — emotional close on the face (eyes, micro-expression), OR a striking final beat that leaves desire, not explanation. This is the slide they leave with; it earns the follow/save. Face visible and engaging. NOT a face-out detail crop.",
  reel_start_frame:
    "REEL COVER + identity anchor — this frame is both the thumbnail that earns the tap AND the image the video animates from. Face clearly forward, eyes to camera, an expressive, magnetic micro-moment. Bold, high-contrast, strong subject presence; works standalone as a scroll-stopper. Vertical 9:16. (Critical: face forward and clearly visible — a cropped/headless/face-away frame makes the video model invent a new face and loses the identity.)",
  reel_video:
    "First 1 second = strongest motion AND face to camera — this is the scroll-stop for a cold viewer with zero context. Standalone: no narrative dependency, a stranger must get it in ~2 seconds. Keep her face toward camera throughout (no turn-away / pan-off / push-to-wide, or the model invents a new face). Gentle but immediately readable motion. 5–9s, 9:16, explicit loop at the end.",
};

// Slots dropped in discovery mode (carousel trimmed 5 → 3).
const DISCOVERY_DROP: Set<SlotName> = new Set(["carousel_4", "carousel_5"]);

// Returns the daily deck. In discovery mode: drop carousel_4/5 and swap in the
// reel-hero + 3-slide-carousel framing.
export function dailySlots(discoveryMode = false): SlotSpec[] {
  if (!discoveryMode) return DAILY_SLOTS;
  return DAILY_SLOTS
    .filter((s) => !DISCOVERY_DROP.has(s.slot))
    .map((s) => (DISCOVERY_FRAMING[s.slot] ? { ...s, framing: DISCOVERY_FRAMING[s.slot]! } : s));
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

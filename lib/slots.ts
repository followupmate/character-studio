// Slot label maps — single source of truth. Previously SLOT_SHORT was duplicated
// verbatim in GenerateDayButton and Dashboard, and SLOT_LABELS lived in MediaCard.

// Short chips: C1..C5 / START / VIDEO / STORY
export const SLOT_SHORT: Record<string, string> = {
  carousel_1: "C1",
  carousel_2: "C2",
  carousel_3: "C3",
  carousel_4: "C4",
  carousel_5: "C5",
  reel_start_frame: "START",
  reel_video: "VIDEO",
  story_bts: "STORY",
};

// Long labels for the media card header
export const SLOT_LABELS: Record<string, string> = {
  carousel_1: "CAROUSEL 1 · WIDE",
  carousel_2: "CAROUSEL 2 · MID",
  carousel_3: "CAROUSEL 3 · DETAIL",
  carousel_4: "CAROUSEL 4 · REVERSE",
  carousel_5: "CAROUSEL 5 · EMOTIONAL",
  reel_start_frame: "REEL · START FRAME",
  reel_video: "REEL · VIDEO",
  story_bts: "STORY · BTS",
};

export function slotShort(slot: string | null | undefined, fallback = ""): string {
  if (!slot) return fallback;
  return SLOT_SHORT[slot] ?? slot.toUpperCase();
}

export function slotLabel(slot: string | null | undefined, fallback = ""): string {
  if (!slot) return fallback;
  return SLOT_LABELS[slot] ?? slot.toUpperCase();
}

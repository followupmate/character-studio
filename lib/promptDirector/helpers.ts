import type { PromptDirectorInput } from "./types";

// Shared helpers reused by both the image and video section builders. Kept deliberately small and
// pure so they're trivial to unit test and don't need a Claude call.

const CLOSE_UP_ARCHETYPES = new Set(["emotional_close", "fabric_texture", "hands_object"]);
const CLOSE_UP_FRAMING_HINTS = /close[- ]?up|emotional close|face-crop|texture|detail/i;

export function isCloseUpArchetype(input: Pick<PromptDirectorInput, "archetypeId" | "slot">): boolean {
  if (CLOSE_UP_ARCHETYPES.has(input.archetypeId)) return true;
  return CLOSE_UP_FRAMING_HINTS.test(input.slot.framing);
}

const PROP_ARCHETYPES = new Set(["hands_object", "interaction_object", "creator_process", "setup_shot"]);

export function archetypeAllowsProp(archetypeId: string): boolean {
  return PROP_ARCHETYPES.has(archetypeId);
}

export function sacredList(sacred: Record<string, unknown> | null, key: string): string[] {
  if (!sacred) return [];
  const v = (sacred as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.map(String) : [];
}

export function sacredAnatomyAnchors(sacred: Record<string, unknown> | null): Record<string, string> {
  if (!sacred) return {};
  const v = (sacred as { anatomy_anchors?: Record<string, string> }).anatomy_anchors;
  return v && typeof v === "object" ? v : {};
}

// Dedupe while preserving first-seen order and dropping empty/whitespace-only entries — every
// section builder below returns through this so the compiler never has to dedupe twice.
export function cleanList(items: Array<string | null | undefined | false>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item) continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

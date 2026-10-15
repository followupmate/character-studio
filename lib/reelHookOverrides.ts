// Per-date reel overlay + caption override (controversy test, 2026-10). Data-only control:
// chs_characters.feature_flags.reel_hook_overrides = {
//   "2026-10-20": { "hook_text": "...", "caption": "...", "tag": "controversy_v1" } }
// Key = story date (chs_story_days.date). Absent key -> normal behaviour. isFlagOn() only reads
// `=== true` booleans, so this object never toggles a flag. Roll back = delete the key.
import { isBannedHookText } from "@/lib/recovery/reelRecipes";

export interface ReelHookOverride {
  hook_text: string;
  caption?: string | null;
  tag?: string | null;
}

export function reelHookOverrideFor(flags: unknown, date: string | null | undefined): ReelHookOverride | null {
  if (!date || !flags || typeof flags !== "object") return null;
  const map = (flags as Record<string, unknown>).reel_hook_overrides;
  if (!map || typeof map !== "object") return null;
  const o = (map as Record<string, unknown>)[date];
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.hook_text !== "string" || !r.hook_text.trim() || isBannedHookText(r.hook_text)) return null;
  return {
    hook_text: r.hook_text.trim(),
    caption: typeof r.caption === "string" && r.caption.trim() ? r.caption.trim() : null,
    tag: typeof r.tag === "string" && r.tag.trim() ? r.tag.trim() : null,
  };
}

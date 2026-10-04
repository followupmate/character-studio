// The caption / hook / hashtag rules, in ONE place.
//
// These were inline in lib/storyGeneration.ts's system prompt. Recovery days need a caption
// written for the RECOVERY scene rather than the story engine's own scene, and the one thing that
// must not happen is two copies of these rules drifting apart — a recovery caption obeying
// slightly different voice rules than every other day is exactly the kind of quiet inconsistency
// this sprint exists to remove. Both callers import this string verbatim.
export const STORY_COPY_RULES = `- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. one emoji maximum (not mandatory). everyday: warm, relatable, one real detail. wellness: confident, light, earned-glow. intimate: daring and self-possessed, a quiet confidence — never pointing anywhere else (e.g. "woke up like this. stayed like this.", "the mirror in here is doing something illegal", "the light in here knows what it's doing"). NEVER mention another platform, a link, "the rest", "somewhere else", "inside", "uncut", "private" or "exclusive" — the public caption is Instagram-only. travel: name the place, one sharp observation. Never bland.
- hook_text: OPTIONAL. Short overlay text for carousel image — include in roughly 35% of days only, when the day has a strong visual hook. 2 to 5 words, lowercase, no punctuation. everyday: "slow morning", "no plans today", "twenty minutes of light". wellness: "earned it", "two more than yesterday", "post-gym glow". intimate: "do not disturb", "one more minute", "you wouldn't". travel: "rome at midnight", "arrived. not leaving." Omit entirely if no strong hook emerges.
- hashtags: array of 3 to 5 strings without # (Instagram caps a post at 5). Topical only — describe the activity, garment, aesthetic or place of THIS post (e.g. pilates → reformerpilates, morningroutine; outfit → neutralstyle, quietluxury). No generic tags (reels, explore, fyp, viral), no branded tags, no adult tags that risk the IG account.`;

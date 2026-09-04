// The caption / hook / hashtag rules, in ONE place.
//
// These were inline in lib/storyGeneration.ts's system prompt. Recovery days need a caption
// written for the RECOVERY scene rather than the story engine's own scene, and the one thing that
// must not happen is two copies of these rules drifting apart — a recovery caption obeying
// slightly different voice rules than every other day is exactly the kind of quiet inconsistency
// this sprint exists to remove. Both callers import this string verbatim.
export const STORY_COPY_RULES = `- ig_caption: 1 to 2 lines. lowercase preferred. no hashtags. one emoji maximum (not mandatory). everyday: warm, relatable, one real detail. wellness: confident, light, earned-glow. intimate: daring with a quiet invitation, an edge that hints there is more elsewhere (e.g. "woke up like this. stayed like this.", "the mirror in here is doing something illegal", "you only get the rest of this somewhere else 😏"). travel: name the place, one sharp observation. Never bland.
- hook_text: OPTIONAL. Short overlay text for carousel image — include in roughly 35% of days only, when the day has a strong visual hook. 2 to 5 words, lowercase, no punctuation. everyday: "slow morning", "no plans today", "twenty minutes of light". wellness: "earned it", "two more than yesterday", "post-gym glow". intimate: "do not disturb", "the rest is private", "come find me". travel: "rome at midnight", "arrived. not leaving." Omit entirely if no strong hook emerges.
- hashtags: array of 10 strings without # (mix to fit today's tier: everyday/wellness → 3 lifestyle · 2 fitness/wellness · 2 aesthetic · 2 niche · 1 branded; travel → swap some for location tags. Avoid spammy adult tags that risk the IG account.)`;

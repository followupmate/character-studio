// YouTube Shorts metadata — built per story day instead of reusing the IG caption.
//
// Why: until Nov 2026 every Short went up as "Vivienne — 2026-11-12" with the raw IG
// caption as description and no tags. A date carries no search or browse signal, and the
// IG CTA lines ("send this to the friend who…", "link in bio") mean nothing on YouTube.
//
// buildYouTubeMeta() is deterministic (no network) so the queueing routes always get a
// usable title; generateYouTubeTitle() optionally asks Claude for a better hook and falls
// back to the deterministic title on any error or timeout.

import { anthropic } from "@/lib/anthropic";
import { youtubeScheduleFor, type SchedulableCharacter } from "@/lib/publishTime";

export const YT_TITLE_MAX = 60; // Shorts surfaces truncate around here; YouTube's hard limit is 100
const YT_DESCRIPTION_MAX = 4500; // hard limit 5000 bytes
const YT_TAGS_MAX_CHARS = 450; // hard limit 500 chars across all tags

export interface YouTubeMetaInput {
  name: string; // character name, e.g. "Vivienne"
  caption: string | null; // the day's IG caption (story copy)
  hashtags: string[] | null; // the day's IG hashtags (without '#')
  location?: string | null; // story_day.location, free text
  homeCity?: string | null; // character's home city for tags, e.g. "Barcelona"
}

export interface YouTubeMeta {
  title: string;
  description: string;
  tags: string[];
}

// IG-only lines that should not travel to YouTube.
const IG_ONLY_LINE = [
  /link in bio/i,
  /\bsave this\b/i,
  /\bsend this to\b/i,
  /\bshare this with\b/i,
  /\btag (a|the|your)\b/i,
  /^comment\b/i,
  /\bin (my|the) stories?\b/i,
  /\bdm me\b/i,
  // Engagement bait — YouTube demotes it on Shorts, and it reads as spam in a description.
  /\bcomment\s+["'“]?[A-Z]{2,}\b/, // "comment YES", "comment 'PARIS'"
  /\bdouble[- ]tap\b/i,
  /\blike if\b/i,
  /\bfollow for (more|part)\b/i,
];

// Flirt-bait hooks ("would you rub them for me?", "did you miss me like this?") are fine in
// an IG caption but make a weak, risky YouTube TITLE. They stay in the description body
// and the title falls through to the next line / place / name.
const FLIRT_HOOK = /\b(would|do|did|wanna) you\b.*\b(me|my|them)\b.*\?\s*$/i;

export function cleanCaptionLines(caption: string | null): string[] {
  return (caption ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !IG_ONLY_LINE.some((re) => re.test(l)))
    .filter((l) => !/^(#\w+\s*)+$/.test(l)); // hashtag-only lines
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Trim to `max` chars on a word boundary, no dangling punctuation.
export function clampTitle(s: string, max = YT_TITLE_MAX): string {
  const t = s.replace(/\s+/g, " ").replace(/[<>]/g, "").trim(); // '<' '>' are rejected by the API
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const atSpace = cut.lastIndexOf(" ");
  return (atSpace > max * 0.5 ? cut.slice(0, atSpace) : t.slice(0, max)).replace(/[\s,;:–—-]+$/, "").trim();
}

// "her bedroom in the morning, white bedding (her own home)" -> null (not a place name)
// "El Born neighbourhood stone-paved courtyard café, Barcelona" -> "Barcelona"
const KNOWN_PLACES = [
  "Barcelona", "El Born", "Lisbon", "Amalfi", "Positano", "Paris", "Rome", "Milan", "Madrid",
  "Ibiza", "Mallorca", "Nice", "Cannes", "Monaco", "Santorini", "Mykonos", "Capri", "Florence",
  "Venice", "Marseille", "Porto", "Seville", "Valencia", "London", "Dubai", "Bali", "Tulum",
];
export function placeFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const hit = KNOWN_PLACES.find((p) => new RegExp(`\\b${p}\\b`, "i").test(location));
  return hit ?? null;
}

function slugTag(h: string): string {
  return h.replace(/^#/, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function buildYouTubeMeta(input: YouTubeMetaInput): YouTubeMeta {
  const lines = cleanCaptionLines(input.caption);
  const place = placeFromLocation(input.location);
  const hook = lines.find((l) => !FLIRT_HOOK.test(l)) ?? "";

  // Title: the caption hook carries the curiosity; the name makes the channel searchable.
  // A one-word hook ("meow.") is too thin on its own, so it gets the place or name.
  let title: string;
  if (hook.length >= 18) {
    title = capitalise(hook);
  } else if (hook) {
    title = `${capitalise(hook.replace(/[.]+$/, ""))} — ${place ?? input.name}`;
  } else {
    title = place ? `A day in ${place}` : `A day with ${input.name}`;
  }
  title = clampTitle(title);

  const hashtags = (input.hashtags ?? []).map(slugTag).filter(Boolean);
  // #Shorts first, then 3 of the day's own tags. YouTube shows the first 3 hashtags above
  // the title and ignores ALL hashtags if there are more than 60, so keep it short.
  const descTags = Array.from(new Set(["shorts", ...hashtags.slice(0, 3)]));

  const body = lines.join("\n");
  const description = [
    body,
    "",
    `${input.name} — slow mornings, good light, and wherever the week takes her${input.homeCity ? ` (home: ${input.homeCity})` : ""}.`,
    "Subscribe for a new short every day.",
    "",
    descTags.map((t) => `#${t}`).join(" "),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, YT_DESCRIPTION_MAX);

  const rawTags = [
    input.name,
    input.homeCity,
    place && place !== input.homeCity ? place : null,
    "day in my life",
    "slow living",
    "lifestyle",
    ...hashtags,
  ].filter((t): t is string => !!t && t.trim().length > 0);
  const tags: string[] = [];
  let used = 0;
  for (const t of Array.from(new Set(rawTags.map((x) => x.trim())))) {
    const cost = t.length + (t.includes(" ") ? 2 : 0) + 1; // quotes for multi-word + comma
    if (used + cost > YT_TAGS_MAX_CHARS) break;
    tags.push(t);
    used += cost;
  }

  return { title, description, tags };
}

// chs_posts fields for the YouTube copy of a day's reel — shared by /api/publish/from-batch
// and /api/review/approve. `hashtags` holds the video TAGS on YouTube rows.
export async function youtubeReelFields(
  char: SchedulableCharacter & { name: string; backstory?: string | null },
  storyDay: {
    ig_caption: string | null;
    hashtags: string[] | null;
    location?: string | null;
    mood?: string | null;
    narrative?: string | null;
  },
  date: string,
  fallbackAt: string
): Promise<{ scheduled_at: string; yt_title: string; yt_description: string; hashtags: string[] }> {
  const input: YouTubeMetaInput = {
    name: char.name,
    caption: storyDay.ig_caption,
    hashtags: storyDay.hashtags,
    location: storyDay.location ?? null,
    homeCity: placeFromLocation(char.backstory),
  };
  const meta = buildYouTubeMeta(input);
  const title = await generateYouTubeTitle(
    { ...input, narrative: storyDay.narrative ?? null, mood: storyDay.mood ?? null },
    meta.title
  );
  return {
    scheduled_at: youtubeScheduleFor(char, date) ?? fallbackAt,
    yt_title: title,
    yt_description: meta.description,
    hashtags: meta.tags,
  };
}

// Optional: let Claude write a stronger hook title. Never throws; returns the fallback
// title when the key is missing, the call fails or it takes longer than `timeoutMs`.
export async function generateYouTubeTitle(
  input: YouTubeMetaInput & { narrative?: string | null; mood?: string | null },
  fallback: string,
  timeoutMs = 12_000
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const call = anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      system:
        "You write YouTube Shorts titles for a lifestyle creator. Output ONLY the title, no quotes. " +
        `Max ${YT_TITLE_MAX} characters. A curiosity hook in the creator's voice (lowercase-casual is fine), ` +
        "concrete (a place, an object, a moment), no clickbait lies, no hashtags, no emojis, no dates, " +
        "nothing sexual or suggestive.",
      messages: [
        {
          role: "user",
          content: [
            `Creator: ${input.name}`,
            input.location ? `Where: ${input.location}` : "",
            input.mood ? `Mood: ${input.mood}` : "",
            input.narrative ? `What happens: ${input.narrative.slice(0, 600)}` : "",
            input.caption ? `Instagram caption: ${input.caption.slice(0, 400)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs));
    const msg = await Promise.race([call, timeout]);
    if (!msg) return fallback;
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const t = clampTitle(text.split("\n")[0].replace(/^["'“”]+|["'“”]+$/g, "").replace(/#\S+/g, ""));
    return t.length >= 8 ? t : fallback;
  } catch {
    return fallback;
  }
}

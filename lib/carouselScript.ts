import { claudeWithRetry } from "@/lib/generatePrompts";

export type CarouselRole = "hook" | "rehook" | "story" | "aha" | "cta";

export interface CarouselSlide {
  slide: number; // 1–5
  role: CarouselRole;
  overlay_text: string; // 2–5 words, lowercase, no punctuation
  visual_intention: string; // 1 sentence: what the photo should show to serve this arc role
}

export interface CarouselScript {
  theme: string; // the carousel's core curiosity angle
  slides: CarouselSlide[]; // always 5
}

interface ScriptArgs {
  tier: string;
  location: string;
  mood: string;
  narrative: string;
  emotional_beat: string | null;
  character: { name: string; visual_brief: string };
}

function buildPrompt(args: ScriptArgs): string {
  const tierNote =
    args.tier === "intimate_aesthetic"
      ? "intimate tier: body-aware, self-possessed. provocation through confidence and indirection — never explicit. the overlay text carries an edge."
      : "lifestyle_travel tier: warm, location-anchored, aspirational. name the place or the specific sensory truth. leave desire in the room without selling it.";

  return `You are a viral content strategist for ${args.character.name}'s Instagram carousel.

CHARACTER: ${args.character.visual_brief}
TIER: ${args.tier}
TODAY: ${args.location} — ${args.mood}${args.emotional_beat ? ` — ${args.emotional_beat}` : ""}
NARRATIVE: ${args.narrative}

CAROUSEL ARC (5 slides, scroll-stopping curiosity loop):

Slide 1 — HOOK: Pattern interrupt. Bold, unexpected, makes viewer think "wait — what?"
Slide 2 — REHOOK: Adds intrigue without answering. Open loop. Viewer NEEDS slide 3.
Slide 3 — STORY: The intimate detail. The sensory truth only someone there would know.
Slide 4 — AHA: The turn. Save-worthy insight or perspective shift. The "oh" moment.
Slide 5 — CTA: Emotional closer. Leaves desire, not explanation. Makes them follow or save.

VOICE:
- ${tierNote}
- overlay_text: 2–5 words, lowercase, no punctuation, no emojis
- each overlay_text creates momentum to the next slide
- direct, personal — like a note someone wasn't supposed to read
- NEVER: "healing", "soft life", "main character", "era", "manifesting", "wanderlust", hollow affirmations

visual_intention: 1 sentence describing what the photo should physically show to serve this arc role. Concrete, not emotional.

OUTPUT: valid JSON only. No markdown, no explanation.
{
  "theme": "one sentence: this carousel's core curiosity angle",
  "slides": [
    { "slide": 1, "role": "hook",   "overlay_text": "...", "visual_intention": "..." },
    { "slide": 2, "role": "rehook", "overlay_text": "...", "visual_intention": "..." },
    { "slide": 3, "role": "story",  "overlay_text": "...", "visual_intention": "..." },
    { "slide": 4, "role": "aha",    "overlay_text": "...", "visual_intention": "..." },
    { "slide": 5, "role": "cta",    "overlay_text": "...", "visual_intention": "..." }
  ]
}`;
}

export async function generateCarouselScript(args: ScriptArgs): Promise<CarouselScript> {
  const msg = await claudeWithRetry({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: buildPrompt(args),
    messages: [{ role: "user", content: "Generate the 5-slide carousel script now." }],
  });

  const rawText = (msg.content[0] as { type: string; text: string }).text;
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let script: CarouselScript;
  try {
    script = JSON.parse(jsonText) as CarouselScript;
  } catch {
    throw new Error(`Carousel script JSON parse failed. Claude returned: ${rawText.slice(0, 300)}`);
  }

  for (const slide of script.slides) {
    slide.overlay_text = slide.overlay_text.toLowerCase().replace(/[.!?,]+$/, "").trim();
  }

  return script;
}

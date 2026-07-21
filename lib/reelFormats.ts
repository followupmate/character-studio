// Proven short-form reel formats — battle-tested retention structures for a
// lifestyle/aesthetic female creator on Instagram. Used only in discovery mode:
// the engine rotates one format per day and injects its directive into the reel
// framing, so every reel has a deliberate stop → hold → rewatch/share shape
// instead of a generic "pretty clip". SFW-forward for public reach (the intimate
// edge stays in the caption/funnel, not the reel).
//
// CRITICAL — the text hook is an OVERLAY, never a rendered pixel. AI image/video
// generators cannot spell; any "on-screen text" they try to draw comes out as
// garbled scribble. So these cues describe the VISUAL cover only (expression,
// composition, what is withheld) and always reserve clean negative space for a
// real text overlay added later in the editor. The actual hook words live in
// story_days.hook_text (e.g. "she finally went"), applied on top in post.

export interface ReelFormat {
  id: string;
  label: string;
  // Appended to the reel first-frame (cover) framing. Visual only — never asks
  // the image gen to render text (it can't; it scribbles). Always reserves
  // negative space for the overlay added in post.
  coverCue: string;
  // Appended to the reel motion/video framing — the retention structure.
  videoDirective: string;
  // Suggested style for the text OVERLAY the creator lays on top in the editor.
  // Not sent to the image gen — surfaced to the operator alongside hook_text.
  overlayStyle: string;
}

export const REEL_FORMATS: ReelFormat[] = [
  {
    id: "pov",
    label: "POV",
    coverCue: "Face forward, warm eye contact down the lens — an 'it's just us' moment. Leave space in the top third for the overlay.",
    videoDirective: "She looks and gestures to the camera like it's the viewer — a glance, a small shared moment. Loops back to the opening glance.",
    overlayStyle: "First-person 'pov:' line — e.g. 'pov: your girl on a slow sunday'. Lowercase, top third.",
  },
  {
    id: "wait_for_it",
    label: "Wait-for-it",
    coverCue: "Mid-anticipation — a held breath, eyes starting to lift, a turn just beginning. Withhold the payoff. Space in the top third for the overlay.",
    videoDirective: "First ~3s builds a small anticipation, then a satisfying payoff lands at 4–5s (a reveal, the light hits, a smile breaks). Seamless loop.",
    overlayStyle: "A 'wait for it' promise — 'wait for the light', 'watch till the end'. Lowercase, top third.",
  },
  {
    id: "grwm",
    label: "GRWM",
    coverCue: "Unfinished, in-process getting-ready moment — relaxed and real, face visible. Space in the top third for the overlay.",
    videoDirective: "One or two quick get-ready steps ending on the finished, self-possessed look. 2–3 beats, end on the eye-contact 'done' moment.",
    overlayStyle: "A 'grwm' moment — 'grwm for a slow morning', 'get ready with me — nowhere to be'. Lowercase, top third.",
  },
  {
    id: "romanticize",
    label: "Romanticize",
    coverCue: "One ordinary detail made cinematic (coffee, window light, a stretch) — warm, aspirational. Space for the overlay.",
    videoDirective: "2–3 gentle beats that make an ordinary moment feel cinematic and save-worthy. Loop on the prettiest frame.",
    overlayStyle: "Romanticizes the ordinary — 'romanticize your morning', 'the little things'. Lowercase, top third.",
  },
  {
    id: "reveal_transition",
    label: "Reveal / transition",
    coverCue: "The clean 'before' state; the change withheld. Space in the top third for the overlay.",
    videoDirective: "A clean before → after turn (a spin, a step out and back, a hand across the lens). Snappy, satisfying, loops before → after.",
    overlayStyle: "Teases the change — 'watch the switch', 'give me one second'. Lowercase, top third.",
  },
  {
    id: "relatable_confession",
    label: "Relatable confession",
    coverCue: "One clear expressive beat embodying a small honest feeling (a knowing look, a relieved slump). Space for the overlay.",
    videoDirective: "The visual embodies one honest feeling in a single clear beat — made to be shared to a friend as 'literally us'. One idea, clean loop.",
    overlayStyle: "A relatable confession — 'nobody's coming over so', 'me pretending i have plans'. Lowercase, top third.",
  },
  {
    id: "asmr_satisfying",
    label: "Satisfying / ASMR",
    coverCue: "A satisfying tactile detail, close and clean (pouring, folding, fabric), her still in frame. A little space for an optional overlay.",
    videoDirective: "One repeatable, oddly-satisfying action shot close (pouring coffee, smoothing a sheet). Loops perfectly — pure watch-time. Keep her face in frame.",
    overlayStyle: "Optional and minimal — a single quiet word, or none.",
  },
];

// Deterministic rotation by a per-day seed (day_number), so formats cycle evenly
// rather than repeating or clustering.
export function pickReelFormat(seed: number): ReelFormat {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const i = ((s % REEL_FORMATS.length) + REEL_FORMATS.length) % REEL_FORMATS.length;
  return REEL_FORMATS[i];
}

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
    coverCue:
      "Face forward, warm direct eye contact straight down the lens as if looking at the viewer — an intimate 'it's just us' micro-moment. Clean composition with deliberate empty negative space in the top third for a text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "POV format: she interacts with the CAMERA as if it were the viewer — a glance, a small gesture toward the lens, a shared private moment. Intimacy through direct address. The viewer should feel talked-to, not watched. Loop back to the opening glance. Keep the top third clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay reads like a first-person 'pov:' line — e.g. 'pov: your girl on a slow sunday'. Lowercase, top third.",
  },
  {
    id: "wait_for_it",
    label: "Wait-for-it",
    coverCue:
      "The cover deliberately withholds the payoff — she is mid-anticipation (a held breath, eyes just beginning to lift, a turn barely started), one magnetic expressive beat. Leave clean empty negative space in the top third for a text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "Wait-for-it structure: the first ~3s builds a small anticipation (she moves toward something, the light shifts, a turn begins), then a SATISFYING payoff beat lands at 4-5s (the reveal, the light hits, the smile breaks). The payoff is worth the wait and makes a viewer rewatch to see the build again. Seamless loop. Keep the top third clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay is a 'wait for it' promise — 'wait for the light', 'watch till the end'. Lowercase, top third.",
  },
  {
    id: "grwm",
    label: "GRWM",
    coverCue:
      "Cover shows the unfinished, in-process 'getting ready' state — one step caught mid-way, relaxed and real, face visible. Leave clean empty negative space in the top third for a text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "GRWM (get-ready-with-me): a short process → result arc — one or two quick steps of getting ready, ending on the finished, self-possessed look. Relatable and save-worthy (people save routines). Keep it to 2-3 beats, end on the eye-contact 'done' moment. Keep the top third clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay frames a 'grwm' moment — 'grwm for a slow morning', 'get ready with me — nowhere to be'. Lowercase, top third.",
  },
  {
    id: "romanticize",
    label: "Romanticize",
    coverCue:
      "Cover finds cinematic beauty in one ordinary detail (coffee, light through a window, a stretch) — warm, aspirational, the kind of frame someone wants to live inside. Leave clean empty negative space for a text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "'Romanticize your life' aesthetic vlog: 2-3 gentle beats that make an ordinary moment feel cinematic and aspirational (coffee, light, a stretch, a window). Slow, warm, save-worthy. The viewer should want to live in it. Loop on the most beautiful frame. Keep space clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay romanticizes the ordinary — 'romanticize your morning', 'the little things'. Lowercase, top third.",
  },
  {
    id: "reveal_transition",
    label: "Reveal / transition",
    coverCue:
      "Cover is the 'before' state, clean and composed; the change is withheld. Leave clean empty negative space in the top third for a teaser text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "Reveal / transition: a clean before → after turn (a spin, a step out of frame and back, a light or outfit change signalled by a hand across the lens). The transition is snappy and satisfying; viewers rewatch to catch it. Loop so before follows after seamlessly. Keep the top third clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay teases the change — 'watch the switch', 'give me one second'. Lowercase, top third.",
  },
  {
    id: "relatable_confession",
    label: "Relatable confession",
    coverCue:
      "Cover embodies a small honest feeling with one clear expressive beat (a knowing look, a relieved exhale, a comfortable slump). Leave clean empty negative space in the top third for a confession-style text overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "Relatable confession: the visual embodies one small honest feeling with a single clear expressive beat (a knowing look, a relieved exhale, a comfortable slump). Made to be SHARED to a friend with 'literally us'. Short, one idea, clean loop. Keep the top third clear for the overlay; render no text in the video.",
    overlayStyle:
      "Overlay is a relatable confession — 'nobody's coming over so', 'me pretending i have plans'. Lowercase, top third.",
  },
  {
    id: "asmr_satisfying",
    label: "Satisfying / ASMR",
    coverCue:
      "Cover centers a satisfying tactile detail (pouring, folding, a fabric, a surface), shot close and clean, with her still in frame for identity. Leave a little clean negative space for an optional minimal overlay added later. Render NO text, letters or words in the image.",
    videoDirective:
      "Satisfying / ASMR loop: one repeatable, tactile, oddly-satisfying action (pouring coffee, smoothing a sheet, running a hand along fabric) shot close and clean. No cut, no rush. The action loops perfectly so it plays on repeat unnoticed — pure watch-time. Keep her face in frame for identity even if the action is the star. Render no text in the video.",
    overlayStyle:
      "Overlay optional and minimal — a single quiet word or none at all.",
  },
];

// Deterministic rotation by a per-day seed (day_number), so formats cycle evenly
// rather than repeating or clustering.
export function pickReelFormat(seed: number): ReelFormat {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const i = ((s % REEL_FORMATS.length) + REEL_FORMATS.length) % REEL_FORMATS.length;
  return REEL_FORMATS[i];
}

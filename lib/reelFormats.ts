// Proven short-form reel formats — battle-tested retention structures for a
// lifestyle/aesthetic female creator on Instagram. Used only in discovery mode:
// the engine rotates one format per day and injects its directive into the reel
// framing, so every reel has a deliberate stop → hold → rewatch/share shape
// instead of a generic "pretty clip". SFW-forward for public reach (the intimate
// edge stays in the caption/funnel, not the reel).

export interface ReelFormat {
  id: string;
  label: string;
  // Appended to the reel first-frame (cover) framing.
  coverCue: string;
  // Appended to the reel motion/video framing — the retention structure.
  videoDirective: string;
}

export const REEL_FORMATS: ReelFormat[] = [
  {
    id: "pov",
    label: "POV",
    coverCue:
      "On-screen text starts with 'pov:' — a first-person scenario that puts the viewer inside the moment with her (e.g. 'pov: she made you breakfast', 'pov: your girl on a slow sunday'). Face forward, warm eye contact as if looking at the viewer.",
    videoDirective:
      "POV format: she interacts with the CAMERA as if it were the viewer — a glance, a small gesture toward the lens, a shared private moment. Intimacy through direct address. The viewer should feel talked-to, not watched. Loop back to the opening glance.",
  },
  {
    id: "wait_for_it",
    label: "Wait-for-it",
    coverCue:
      "On-screen text is a 'wait for it' promise ('wait for the light', 'watch till the end', 'give it 3 seconds'). The cover deliberately withholds the payoff.",
    videoDirective:
      "Wait-for-it structure: the first ~3s builds a small anticipation (she moves toward something, the light shifts, a turn begins), then a SATISFYING payoff beat lands at 4-5s (the reveal, the light hits, the smile breaks). The payoff is worth the wait and makes a viewer rewatch to see the build again. Seamless loop.",
  },
  {
    id: "grwm",
    label: "GRWM",
    coverCue:
      "On-screen text frames a 'get ready with me' moment ('grwm for a slow morning', 'get ready with me — nowhere to be'). Cover shows the unfinished, in-process state.",
    videoDirective:
      "GRWM (get-ready-with-me): a short process → result arc — one or two quick steps of getting ready, ending on the finished, self-possessed look. Relatable and save-worthy (people save routines). Keep it to 2-3 beats, end on the eye-contact 'done' moment.",
  },
  {
    id: "romanticize",
    label: "Romanticize",
    coverCue:
      "On-screen text romanticizes an ordinary moment ('romanticize your morning', 'the little things', 'this is the life'). Cover finds beauty in a mundane detail.",
    videoDirective:
      "'Romanticize your life' aesthetic vlog: 2-3 gentle beats that make an ordinary moment feel cinematic and aspirational (coffee, light, a stretch, a window). Slow, warm, save-worthy. The viewer should want to live in it. Loop on the most beautiful frame.",
  },
  {
    id: "reveal_transition",
    label: "Reveal / transition",
    coverCue:
      "Cover is the 'before' state; on-screen text hints a change is coming ('watch the switch', 'give me one second'). Withhold the after.",
    videoDirective:
      "Reveal / transition: a clean before → after turn (a spin, a step out of frame and back, a light or outfit change signalled by a hand across the lens). The transition is snappy and satisfying; viewers rewatch to catch it. Loop so before follows after seamlessly.",
  },
  {
    id: "relatable_confession",
    label: "Relatable confession",
    coverCue:
      "On-screen text is a relatable confession the viewer thinks 'this is so me' ('nobody's coming over so', 'me pretending i have plans', 'the introvert's perfect day'). Cover embodies the feeling.",
    videoDirective:
      "Relatable confession: the on-screen text states a small honest feeling, the visual embodies it with one clear expressive beat (a knowing look, a relieved exhale, a comfortable slump). Made to be SHARED to a friend with 'literally us'. Short, one idea, clean loop.",
  },
  {
    id: "asmr_satisfying",
    label: "Satisfying / ASMR",
    coverCue:
      "Cover centers a satisfying tactile detail (pouring, folding, a fabric, a surface). On-screen text optional and minimal.",
    videoDirective:
      "Satisfying / ASMR loop: one repeatable, tactile, oddly-satisfying action (pouring coffee, smoothing a sheet, running a hand along fabric) shot close and clean. No cut, no rush. The action loops perfectly so it plays on repeat unnoticed — pure watch-time. Keep her face in frame for identity even if the action is the star.",
  },
];

// Deterministic rotation by a per-day seed (day_number), so formats cycle evenly
// rather than repeating or clustering.
export function pickReelFormat(seed: number): ReelFormat {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const i = ((s % REEL_FORMATS.length) + REEL_FORMATS.length) % REEL_FORMATS.length;
  return REEL_FORMATS[i];
}

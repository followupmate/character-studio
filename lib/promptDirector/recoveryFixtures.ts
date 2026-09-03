// RECOVERY phase 3 eval set — REAL production rows, copied verbatim out of Supabase on 2026-09-03
// (chs_story_days x chs_daily_plans.scene_brief x chs_media where slot = 'reel_video').
//
// These are not constructed test cases. Days 88–93 are the six reels that actually shipped with
// semantic contradictions and that the existing validator passed with errors: [] / warnings: [].
// Days 76 and 78 are the two best-performing reels in the window (watch 5.01s and 6.02s) and they
// must stay clean — a validator that fires on them is a validator nobody will leave switched on.
//
// The eval runs the NEW checks against the prompts EXACTLY AS THEY SHIPPED, not against freshly
// recompiled ones. That is the only question worth asking: would this validator have caught what
// actually went out? Re-compiling would test the fix against itself.

export interface RecoveryFixture {
  day: number;
  date: string;
  tier: string;
  /** chs_story_days.location */
  location: string;
  /** scene_brief.spatial_setup */
  spatialSetup: string;
  /** scene_brief.allowed_props */
  allowedProps: string[];
  /** scene_brief.wardrobe_lock */
  wardrobeLock: string;
  /** chs_media.shot_archetype for the reel_video slot */
  archetypeId: string;
  /** chs_media.higgsfield_prompt for the reel_video slot, verbatim */
  prompt: string;
  expect: "pass" | "fail";
  /** What we already know is wrong, for the failure message when the eval regresses. */
  knownViolations: string[];
}

export const RECOVERY_FIXTURES: RecoveryFixture[] = [
  {
    day: 76,
    date: "2026-08-15",
    tier: "wellness_fitness",
    location: "outdoor gym terrace, boutique hotel rooftop, her city",
    spatialSetup:
      "Boutique hotel rooftop terrace — an open-air outdoor platform roughly 8m × 8m of warm poured-concrete floor, no tiles, no markings. Along the far edge a low rendered-concrete parapet wall sits at 1.0m height; beyond it a city skyline of low-to-mid-rise rooftops recedes into soft morning haze. To her right the rolled yoga mat leans against the parapet. Her matte sage-coloured water bottle stands on the floor 30cm to her left. No furniture of any kind — no chairs, no table, no lounger, no planters, no gym equipment, no reformer in frame. The perimeter railing and sky fill the entire background. A few blurred, anonymous, out-of-focus rooftop edges and building faces sit in the soft background. No signage, no logos on any surface, no second sharp face, no additional people in the foreground. — a white concrete high-rise with rounded balconies directly behind her, a sprawl of orange-tiled roofs below, no distant skyscrapers",
    allowedProps: [
      "water bottle — matte sage or clear hard plastic, standing upright on the concrete floor to her left, heavy with condensation on the outside",
    ],
    wardrobeLock:
      "fitted ribbed sports bra in muted sage, high-waisted full-length compression leggings in the same muted sage ribbed seamless fabric, bare feet on warm concrete, thin single delicate gold chain necklace at collarbone height, small gold stud earrings, sleek low ponytail",
    archetypeId: "light_motion",
    prompt:
      "Model: Seedance 2.0 🎬 Video Prompt\n\nStatic chest-height camera faces her directly on the sun-warmed concrete rooftop, the white high-rise with rounded balconies centred behind her and orange-tiled roofs spreading below in soft morning haze; wearing a fitted ribbed sage sports bra and matching high-waisted full-length compression leggings, she lifts the delicate gold chain at her collarbone with one fingertip, holds it a beat, then lowers it and lets her gaze — which had drifted down to her hand — rise slowly back up to meet the lens. Early eastern sun catches her left shoulder gold, sky-fill softens her right; the final frame settles back to her still, chin level, eyes on the lens, matching the opening. 6s, 9:16.",
    expect: "pass",
    knownViolations: [],
  },
  {
    day: 78,
    date: "2026-08-17",
    tier: "intimate_aesthetic",
    location: "her apartment, bedroom — unmade bed, warm low light through half-drawn curtains",
    spatialSetup:
      "Her apartment bedroom — a queen bed with an ivory linen duvet pushed back and slightly bunched toward the headboard occupies the center-back of the frame; the headboard is upholstered in a muted warm fabric, a small framed print hangs above it slightly off-center. To the right of the bed is a low solid-wood or cane bedside table carrying a half-full wine glass of red wine and a switched-on lamp with a warm amber glow. To the left, a tall window with a half-drawn linen curtain lets in the last of the day's warm light at a low angle. The floor is warm wood or a soft rug at the bed's base. One strappy dark heel rests on its side near the door at the far left edge of the room. No desk, no chair, no second table, no wardrobe visible, no plant, no bookshelf, no TV, no overhead lighting active. — a tufted grey upholstered headboard behind her, a pair of brass reading lamps on the nightstands",
    allowedProps: [
      "wine glass on bedside surface — half-full of red wine, faint lip mark on the rim, not held, resting on the low wooden bedside table to the right",
    ],
    wardrobeLock:
      "bias-cut satin slip dress in deep burgundy, one bare foot on the floor, one leg slightly extended, thin single delicate gold chain necklace at collarbone height, small gold drop earrings, sleek center-parted dark wavy hair falling loose past the shoulder, bold deep-berry lip",
    archetypeId: "light_motion",
    prompt:
      "Model: Seedance 2.0 🎬 Video Prompt\n\nStatic chest-height camera faces her directly as she sits on the unmade bed's edge in a deep burgundy bias-cut satin slip dress, one bare foot on the warm wood floor, the other leg slightly extended — she holds the lens with a slow, knowing almost-smile, then her gaze drops briefly before lifting back up to meet the camera with a quiet, private satisfaction as her free hand lifts the delicate gold chain necklace at her collarbone and releases it. The amber bedside lamp dominates from the right, a last wash of low evening gold drifts in from the half-drawn linen curtain at left, the tufted grey headboard and half-full wine glass on the cane nightstand sitting softly in the warm background. Final frame returns to her still, composed opening posture, seamless loop.\n\n7s, 9:16.",
    expect: "pass",
    knownViolations: [],
  },
  {
    day: 88,
    date: "2026-08-27",
    tier: "luxe_car",
    location:
      "interior of a luxury grand tourer, night — rain-clearing Barcelona streets visible through the passenger window, soft amber cabin glow",
    spatialSetup:
      "Passenger cabin of a high-end grand tourer — full-grain quilted black leather bucket seat she is reclined slightly into, one knee raised and resting against the inside of the door panel to her right, small black leather clutch held loosely in her left hand resting in her lap. The passenger window to her right shows rain-clearing Barcelona streets at night: blurred amber streetlamps, wet cobblestone reflections, out-of-focus building facades, no legible signage. Above her, a starlight headliner drops soft gold points of light across her face and bare shoulder. A hotel key card lies flat on the seat leather beside her left hip. The dashboard ahead is barely present at the frame edge. No centre console object, no drinks holder prop, no second seat visible, no driver visible, no rear seat visible.",
    allowedProps: [
      "hotel key card — flat on the quilted leather seat 15cm to her left hip, card face down or angled so no text is legible",
    ],
    wardrobeLock:
      "sleek black one-shoulder mini dress in structured crepe, pointed black heeled sandals, small black leather clutch held loosely in left hand, thin single delicate gold chain necklace at collarbone height, small plain gold hoop earrings",
    archetypeId: "walking_motion",
    prompt:
      'Starting frame constraint: Preserve exact identity, clothing, face structure, seated pose, warm cabin lighting, and vehicle interior from frame 0. Static camera angle, vertical 9:16 framing.\n\nMotion description: From frame 0, the woman remains seated in the car. Motion continues directly from frame 0 with subtle micro-movements: natural blinking, soft chest breathing, and slight natural posture shifts. She keeps continuous eye contact with the camera. Her lips articulate the spoken line naturally without face morphing or exaggerated mouth stretching. First 3 seconds feature her speaking the line, followed by a calm, mysterious hold. No head turning away, no walking, no camera movement.\n\nSpoken line: "These are the last 5 minutes before everything changes."\n\nLoop logic: Returns seamlessly to the resting expression and posture of frame 0 at the end.',
    expect: "fail",
    knownViolations: [
      "walking_motion archetype on a woman reclined in a car seat (locomotion vs. reclining)",
      "speech layer on a scene whose point is not speaking",
      "no declared duration",
      "generic micro-motion boilerplate",
    ],
  },
  {
    day: 89,
    date: "2026-08-28",
    tier: "intimate_aesthetic",
    location:
      "Barcelona rooftop terrace of a boutique hotel — brushed limestone coping, a private plunge pool with mosaic tile, bougainvillea spilling over the stone parapet, late morning sun cutting hard across the terrace",
    spatialSetup:
      "Barcelona rooftop terrace of a boutique hotel — the entire batch takes place within a 6m × 6m zone centered on a private plunge pool with aged mosaic-tile interior in turquoise-green. The near coping is brushed limestone, 30cm wide. To the left, a stone parapet 1m high is covered in bougainvillea casting hard broken shadows across the pale stone floor. There is no furniture on this terrace — no chairs, no table, no sunbed, no umbrella, no towel rack. The only objects present are: one ceramic espresso cup (white, no logo) resting on the near coping 40cm to the subject's right, and one hotel key card lying flat and face-down on the same coping 15cm beyond the cup. The sky above is open, high summer, no clouds.",
    allowedProps: [
      "ceramic espresso cup — white, no logo, resting on limestone coping 40cm to her right",
      "hotel key card — flat, face-down on limestone coping 15cm beyond the cup",
    ],
    wardrobeLock:
      "structured black bralette-style top, oversized white open-weave cotton shirt worn completely open over the bralette, black high-waisted bikini bottoms, barefoot, thin single delicate gold chain necklace, small plain gold hoop earrings, tousled dark wavy hair",
    archetypeId: "gesture_motion",
    prompt:
      "Use the supplied image as the exact starting frame, Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame, Describe only what changes after frame 0 — do not re-describe the starting frame itself.\n\nPreserve exact facial identity throughout the entire shot, Stable facial structure, same hairstyle, same body proportions, No face morphing, no identity drift.\n\nstatic camera, Framing: 5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.\n\nnatural blinking, subtle breathing, minor posture shifts, small head adjustments, she makes a single small, self-contained gesture — turning her head, raising a cup, adjusting a sleeve\n\nRim touches lips, glass tilts naturally, liquid follows gravity, liquid level changes, natural swallow.\n\nNo face morphing, no body morphing, No environment jump, no random camera reframing.",
    expect: "fail",
    knownViolations: [
      "three alternative actions offered instead of one readable action",
      "generic micro-motion boilerplate",
      "duration declared as a 5–9s range, outside the 6–7s rule",
      "internal workflow language leaked into the prompt (reel_start_frame, Kling / Seedance, 'loses Vivienne')",
    ],
  },
  {
    day: 90,
    date: "2026-08-29",
    tier: "lived_moments",
    location: "a city sidewalk between two places — El Born, Barcelona, midday sun, warm stone beneath her sandals",
    spatialSetup:
      "A single 6m stretch of El Born pavement, Barcelona — amber limestone cobblestones underfoot, a small neighbourhood flower stall on the left edge of frame with galvanised buckets of ranunculus, mimosa and eucalyptus sitting directly on the stone at knee height, a faded canvas awning above the stall striped in cream and sage casting one diagonal band of shade across the foreground, the aged ochre-yellow plaster facade of a four-storey building filling the midground at 3–5m behind her with a single tall shuttered window visible, no café tables, no bench, no fruit crates, no market signage, no secondary stall, no parked cars in the immediate foreground — the street continues behind her into soft blur where anonymous pedestrian shapes move at 10m distance.",
    allowedProps: [
      "loose bunch of dusty-rose ranunculus held in her left hand, stems wrapped in a single sheet of kraft paper",
      "canvas tote in natural undyed cotton over her right shoulder",
      "hotel key card held flat between two fingers of the right hand alongside the small dark tan leather passport wallet",
    ],
    wardrobeLock:
      "white linen mini skirt, thin-strap cream ribbed cotton top, tan leather flat sandals, thin single delicate gold chain necklace, small plain gold hoop earrings, oversized sunglasses worn on face",
    archetypeId: "walking_motion",
    prompt:
      "Use the supplied image as the exact starting frame. Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame. Describe only what changes after frame 0 — do not re-describe the starting frame itself.\n\nPreserve exact facial identity throughout the entire shot. Stable facial structure, same hairstyle, same body proportions. No face morphing, no identity drift.\n\nstatic camera. Framing: 5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.\n\nMovement: natural blinking. subtle breathing. minor posture shifts. small head adjustments. she walks, continuing forward motion. Natural walking rhythm, realistic arm swing, small vertical body movement, natural clothing response.\n\nEnvironment motion: Feet contact ground realistically, weight transfers naturally, fabric responds to movement.\n\nsmartphone microphone. car cabin ambience. no artificial studio polish.\n\nNo face morphing, no body morphing. No environment jump, no random camera reframing.",
    expect: "fail",
    knownViolations: [
      "car cabin ambience on an open city sidewalk — the old substring matcher hit 'no parked cars'",
      "generic micro-motion boilerplate",
      "duration declared as a 5–9s range, outside the 6–7s rule",
      "internal workflow language leaked into the prompt",
    ],
  },
  {
    day: 91,
    date: "2026-08-30",
    tier: "intimate_aesthetic",
    location:
      "Barcelona rooftop bar — brushed brass rail, white rendered parapet walls, terracotta tiles underfoot, the city grid spreading south in the late-afternoon sun",
    spatialSetup:
      "Barcelona rooftop bar — a narrow open-air terrace running 8m east to west along the building's south face. The primary surface is terracotta hexagonal floor tiles. The brushed brass parapet rail sits at hip height along the south edge, fixed to a white rendered parapet wall approximately 50cm thick — wide enough to rest a glass on the flat top. Behind the parapet, the Barcelona city grid drops away: flat rooftops, antenna clusters, a church dome to the southeast, all warm and slightly hazy in the late-afternoon light. There is no furniture in this section — no chairs, no tables, no bar counter — just the rail, the ledge, the tiles, and open sky.",
    allowedProps: [
      "champagne coupe held lightly in one hand — clear glass, no logo, pale gold liquid",
      "second champagne coupe resting on flat parapet ledge 40cm to her right — untouched",
    ],
    wardrobeLock:
      "fitted white halter-neck crop top, wide-leg high-waisted tan linen trousers, strappy nude leather sandals with low block heel, thin single delicate gold chain necklace, small plain gold hoop earrings, oversized sunglasses pushed up into dark sleek hair",
    archetypeId: "light_motion",
    prompt:
      'Use the supplied image as the exact starting frame. Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame. Describe only what changes after frame 0 — do not re-describe the starting frame itself.\n\nPreserve exact facial identity throughout the entire shot. Stable facial structure, same hairstyle, same body proportions. No face morphing, no identity drift.\n\nstatic camera. Framing: 5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.\n\nMovement: natural blinking. subtle breathing. minor posture shifts. small head adjustments. light shifts across her — she stays relatively still while the environment moves.\n\nEXACT SPOKEN LINE — DO NOT CHANGE WORDING:\n"Honestly this view makes it really hard to go back inside.". Language: en.\n\nsmartphone microphone. natural room tone. no artificial studio polish.\n\nNo face morphing, no body morphing. No environment jump, no random camera reframing.',
    expect: "fail",
    knownViolations: [
      "indoor room tone on an open-air rooftop terrace",
      "speech layer on a scene whose point is not speaking",
      "generic micro-motion boilerplate",
      "duration declared as a 5–9s range, outside the 6–7s rule",
      "internal workflow language leaked into the prompt",
    ],
  },
  {
    day: 92,
    date: "2026-08-31",
    tier: "wellness_fitness",
    location: "boutique pilates studio — pale oak reformer, brushed brass wall rail, floor-to-ceiling mirror",
    spatialSetup:
      "Boutique pilates studio — a single reformer positioned 1.5m from the back mirror wall, pale oak hardwood floor extending 3m in every direction, floor-to-ceiling windows along the right wall admitting soft diffused morning light, brushed brass horizontal rail mounted on the left wall at 1.1m height, full-length mirror covering the entire back wall, matte white water bottle on the floor at the front-right leg of the reformer, small white towel folded on the reformer frame, no other reformers in the immediate frame, no signage, no equipment racks, no people visible beyond possible soft-blurred figures in the far background through the mirror reflection; the studio is otherwise empty at this hour.",
    allowedProps: [
      "matte white water bottle with no logo — resting on the pale oak floor beside the front-right leg of the reformer, not held",
    ],
    wardrobeLock:
      "white ribbed square-neck sports bra, sculpting black high-waisted leggings, barefoot on pale oak floor, thin single delicate gold chain necklace, small plain gold stud earrings, high ponytail",
    archetypeId: "gesture_motion",
    prompt:
      'Use the supplied image as the exact starting frame. Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame. Describe only what changes after frame 0 — do not re-describe the starting frame itself.\n\nPreserve exact facial identity throughout the entire shot. Stable facial structure, same hairstyle, same body proportions. No face morphing, no identity drift.\n\nstatic camera. Framing: 5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.\n\nMovement: natural blinking. subtle breathing. minor posture shifts. small head adjustments. she makes a single small, self-contained gesture — turning her head, raising a cup, adjusting a sleeve.\n\nEnvironment motion: Rim touches lips, glass tilts naturally, liquid follows gravity, liquid level changes, natural swallow.\n\nEXACT SPOKEN LINE — DO NOT CHANGE WORDING:\n"This reformer has completely changed the way my body moves and feels.". Language: en.\n\nsmartphone microphone. mall reverb. no artificial studio polish.\n\nNo face morphing, no body morphing. No environment jump, no random camera reframing.',
    expect: "fail",
    knownViolations: [
      "drinking-vessel physics in a pilates studio whose only prop is a water bottle on the floor",
      "mall reverb in a boutique studio — the old substring matcher hit 'small white towel'",
      "speech layer on a scene whose point is not speaking",
      "three alternative actions offered instead of one readable action",
      "duration declared as a 5–9s range, outside the 6–7s rule",
      "internal workflow language leaked into the prompt",
    ],
  },
  {
    day: 93,
    date: "2026-09-01",
    tier: "lived_moments",
    location:
      "clifftop boutique hotel sea terrace, Positano — limestone coping, terracotta tile underfoot, a low wide sunbed with linen cushions facing the Tyrrhenian Sea",
    spatialSetup:
      "Clifftop boutique hotel sea terrace, Positano — a private terrace approximately 6m wide by 4m deep; terracotta hand-laid tile underfoot across the full floor; a continuous limestone coping wall runs along the seaward edge at 90cm height, flat-topped, warm from the afternoon sun; a low wide sunbed with thick natural linen cushions sits against the left terrace wall, completely undisturbed; the open suite door is set into the right rear wall, slightly ajar, a sliver of cool interior visible through it; no table, no chairs, no umbrella, no trays, no signage, no pool, no railing beyond the limestone coping; the sea fills everything beyond the coping wall — open Tyrrhenian blue to the horizon.",
    allowedProps: [],
    wardrobeLock:
      "short white linen wrap dress, strappy flat leather sandals, thin single delicate gold chain necklace, small plain gold hoop earrings, thin gold anklet on left ankle, oversized sunglasses pushed up into loose dark wavy hair, small dark tan leather passport wallet held loosely together with hotel key card in right hand",
    archetypeId: "walking_motion",
    prompt:
      'Use the supplied image as the exact starting frame. Preserve identity, clothing, visible accessories, starting pose, lighting, environment and camera orientation from that frame. Describe only what changes after frame 0 — do not re-describe the starting frame itself.\n\nPreserve exact facial identity throughout the entire shot. Stable facial structure, same hairstyle, same body proportions. No face morphing, no identity drift.\n\nstatic camera. Framing: 5–9 seconds, 9:16. Motion prompt for image-to-video (Kling / Seedance). Motion CONTINUES from the reel_start_frame pose — describe what changes from that frame onward (subject motion, camera move, environmental element). Keep her FACE toward camera throughout — avoid motions that turn her head away, pan off her face, or push to a wide shot (the model then invents a new face and loses Vivienne). Prefer gentle, subtle motion. First 0–3s = strongest motion. Loop logic explicit at end.\n\nMovement: natural blinking. subtle breathing. minor posture shifts. small head adjustments. she walks, continuing forward motion. Natural walking rhythm, realistic arm swing, small vertical body movement, natural clothing response.\n\nEnvironment motion: Feet contact ground realistically, weight transfers naturally, fabric responds to movement.\n\nEXACT SPOKEN LINE — DO NOT CHANGE WORDING:\n"This terrace, this light, this view — I genuinely never want to leave.". Language: en.\n\nsmartphone microphone. natural room tone. no artificial studio polish.\n\nNo face morphing, no body morphing. No environment jump, no random camera reframing.',
    expect: "fail",
    knownViolations: [
      "indoor room tone on an open-air clifftop sea terrace",
      "speech layer on a scene whose point is not speaking",
      "generic micro-motion boilerplate",
      "duration declared as a 5–9s range, outside the 6–7s rule",
      "internal workflow language leaked into the prompt",
    ],
  },
];

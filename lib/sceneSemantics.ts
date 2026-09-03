// RECOVERY phase 3, layer 1 foundation — the STRUCTURED fields the deterministic semantic checks
// run against.
//
// The existing validator (lib/promptDirector/validator.ts) checks a prompt against ITSELF: is the
// camera line self-consistent, does a timeline overlap, is the speech too long for the duration.
// It reported errors: [] / warnings: [] on every one of the Days 88–93 prompts, because none of
// those prompts is internally inconsistent — they are inconsistent with THE SCENE. Checking that
// needs the scene expressed as closed classes, not prose, which is what this module provides.
//
// Two ways in:
//   1. Fresh briefs — lib/sceneBrief.ts now asks Claude to emit location_class / action_class /
//      scene_entities / speech_is_the_point directly, so the classes are authored, not guessed.
//   2. Historical briefs (the Days 76–93 eval set, and every row written before this change) —
//      resolveSceneSemantics() derives the same classes deterministically from spatial_setup /
//      location / allowed_props. Pure, no LLM, unit-tested against the real production briefs.

export const LOCATION_CLASSES = [
  "bedroom",
  "bathroom",
  "kitchen",
  "living_room",
  "hotel_room",
  "studio_gym",
  "car_interior",
  "street",
  "cafe_restaurant",
  "bar",
  "shop_boutique",
  "mall",
  "office",
  "terrace_rooftop",
  "pool",
  "beach",
  "nature",
  "other",
] as const;
export type LocationClass = (typeof LOCATION_CLASSES)[number];

export const ACTION_CLASSES = [
  "locomotion", // walking, stepping, striding — the subject translates through space
  "seated_still",
  "standing_still",
  "reclining",
  "gesture", // one self-contained movement of hands/head, body stays put
  "grooming",
  "eating_drinking",
  "exercise",
  "swimming",
  "other",
] as const;
export type ActionClass = (typeof ACTION_CLASSES)[number];

// Classes of ambient sound, not the phrasing. buildAudioSection() emits one PHRASE per class; the
// coherence check works on the class so a reworded phrase can never slip past it.
export const AUDIO_CLASSES = [
  "room_tone",
  "bathroom_reverb",
  "kitchen_tone",
  "car_cabin",
  "mall_reverb",
  "gym_studio",
  "cafe_murmur",
  "bar_murmur",
  "outdoor",
  "water",
] as const;
export type AudioClass = (typeof AUDIO_CLASSES)[number];

// Which ambient classes are physically possible at each location. This is the whole fix for
// "mall reverb in a boutique pilates studio" and "car cabin ambience on a street": an audio class
// outside its location's list is a physical impossibility, not a stylistic choice.
export const AUDIO_CLASSES_BY_LOCATION: Record<LocationClass, AudioClass[]> = {
  bedroom: ["room_tone"],
  bathroom: ["bathroom_reverb", "room_tone", "water"],
  kitchen: ["kitchen_tone", "room_tone"],
  living_room: ["room_tone"],
  hotel_room: ["room_tone"],
  studio_gym: ["gym_studio", "room_tone"],
  car_interior: ["car_cabin"],
  street: ["outdoor"],
  cafe_restaurant: ["cafe_murmur", "room_tone"],
  bar: ["bar_murmur", "room_tone", "outdoor"], // a rooftop bar is legitimately open-air
  shop_boutique: ["room_tone"],
  mall: ["mall_reverb", "room_tone"],
  office: ["room_tone"],
  terrace_rooftop: ["outdoor"],
  pool: ["outdoor", "water"],
  beach: ["outdoor", "water"],
  nature: ["outdoor"],
  other: ["room_tone", "outdoor"],
};

// The phrases the compiler actually emits (lib/promptDirector/videoSections.ts's AMBIENCE_HINTS),
// mapped to their class, so a compiled prompt can be scanned for an ambience claim.
export const AUDIO_PHRASE_CLASSES: Array<{ phrase: string; audioClass: AudioClass }> = [
  { phrase: "bathroom reverb", audioClass: "bathroom_reverb" },
  { phrase: "car cabin ambience", audioClass: "car_cabin" },
  { phrase: "mall reverb", audioClass: "mall_reverb" },
  { phrase: "outdoor ambience", audioClass: "outdoor" },
  { phrase: "natural room tone", audioClass: "room_tone" },
  { phrase: "studio room tone", audioClass: "gym_studio" },
  { phrase: "cafe murmur", audioClass: "cafe_murmur" },
  { phrase: "café murmur", audioClass: "cafe_murmur" },
  { phrase: "bar murmur", audioClass: "bar_murmur" },
  { phrase: "water lapping", audioClass: "water" },
];

// Location detection. Matched on WORD BOUNDARIES, which is the second half of the ambience bug:
// the old matcher used String.includes(), so "small white towel" matched "mall" and "no parked
// cars" matched "car". Both shipped (Day 92, Day 90).
// Ordered most-specific-first. Open-air markers (terrace/rooftop) deliberately outrank
// studio_gym so "outdoor gym terrace, boutique hotel rooftop" resolves to an OUTDOOR place, not
// an indoor one — the audio class hangs off this.
const LOCATION_PATTERNS: Array<{ cls: LocationClass; pattern: RegExp }> = [
  { cls: "car_interior", pattern: /\b(car cabin|passenger cabin|inside (?:the|a) car|car interior|grand tourer|back seat|driver'?s seat|quilted (?:black )?leather (?:bucket )?seat)\b/i },
  { cls: "pool", pattern: /\b(plunge pool|swimming pool|pool deck|poolside|pool)\b/i },
  { cls: "beach", pattern: /\b(beach|shoreline|sand dunes|surf)\b/i },
  { cls: "terrace_rooftop", pattern: /\b(rooftop terrace|roof terrace|sea terrace|terrace|rooftop|balcony)\b/i },
  { cls: "studio_gym", pattern: /\b(pilates studio|yoga studio|gym|weights floor|reformer|studio floor)\b/i },
  { cls: "bathroom", pattern: /\b(bathroom|shower|bathtub|washbasin)\b/i },
  { cls: "kitchen", pattern: /\b(kitchen|worktop|kitchen counter)\b/i },
  { cls: "bedroom", pattern: /\b(bedroom|unmade bed|headboard|nightstand|bedside table)\b/i },
  { cls: "bar", pattern: /\b(rooftop bar|cocktail bar|bar counter|bar)\b/i },
  { cls: "cafe_restaurant", pattern: /\b(caf[ée]|coffee shop|restaurant|bistro|trattoria)\b/i },
  { cls: "mall", pattern: /\b(shopping mall|mall|shopping centre|shopping center)\b/i },
  { cls: "shop_boutique", pattern: /\b(boutique|shop floor|storefront|showroom)\b/i },
  { cls: "hotel_room", pattern: /\b(hotel room|hotel suite|suite)\b/i },
  { cls: "street", pattern: /\b(sidewalk|pavement|city street|street|cobblestone|alley)\b/i },
  { cls: "living_room", pattern: /\b(living room|sofa|lounge)\b/i },
  { cls: "office", pattern: /\b(office|desk setup|co-?working)\b/i },
  { cls: "nature", pattern: /\b(forest|meadow|mountain|trail|park|garden|clifftop|cliff path)\b/i },
];


// Scene briefs are written as much in exclusions as inclusions — "no table, no chairs, no
// umbrella, no signage, no pool" — so a naive scan classifies a Positano sea terrace as a POOL and
// an El Born sidewalk as a CAR (from "no parked cars"). Negated clauses are dropped before any
// classification runs. Exported for its own test: this is load-bearing, not incidental.
// Clause boundaries: comma, semicolon, period, newline, em dash.
const SENTENCE_SPLIT = new RegExp('[,;.\\n\u2014]');
const NEGATED_CLAUSE = new RegExp('^\\s*(no|not|never|nothing|without)\\b', 'i');

export function stripNegations(text: string): string {
  return text
    .split(SENTENCE_SPLIT)
    .filter((clause) => !NEGATED_CLAUSE.test(clause))
    .join(", ");
}

export function classifyLocation(text: string): LocationClass {
  const positive = stripNegations(text);
  for (const { cls, pattern } of LOCATION_PATTERNS) {
    if (pattern.test(positive)) return cls;
  }
  return "other";
}

const ACTION_PATTERNS: Array<{ cls: ActionClass; pattern: RegExp }> = [
  { cls: "swimming", pattern: /\b(swims?|swimming|wading|in the water)\b/i },
  { cls: "exercise", pattern: /\b(pilates|yoga|reformer|workout|training|stretching|lifting weights)\b/i },
  { cls: "locomotion", pattern: /\b(walks?|walking|strides?|stepping (?:out|through|onto)|steps? (?:out|through|onto)|crossing the|moving (?:down|along) the)\b/i },
  { cls: "reclining", pattern: /\b(reclin\w*|lying|lies back|lounging|sprawled)\b/i },
  { cls: "eating_drinking", pattern: /\b(sips?|sipping|drinks?|drinking|eating|bites?)\b/i },
  { cls: "grooming", pattern: /\b(getting ready|applying|brushing her hair|doing her (?:hair|makeup)|skincare)\b/i },
  { cls: "seated_still", pattern: /\b(sits?|seated|sitting|perched on)\b/i },
  { cls: "standing_still", pattern: /\b(stands?|standing|leaning against)\b/i },
];

export function classifyAction(text: string): ActionClass {
  const positive = stripNegations(text);
  for (const { cls, pattern } of ACTION_PATTERNS) {
    if (pattern.test(positive)) return cls;
  }
  return "other";
}

// Action classes in which the subject does NOT translate through space. A prompt asserting
// locomotion over one of these is Day 88's "she walks, continuing forward motion" for a woman
// reclined in the passenger seat of a moving car.
export const STATIONARY_ACTION_CLASSES: ReadonlySet<ActionClass> = new Set<ActionClass>([
  "seated_still",
  "standing_still",
  "reclining",
  "gesture",
  "grooming",
]);

// Physical objects a prompt can plausibly ask the subject to MANIPULATE. Presence in the scene is
// not the test — Day 78's brief has a wine glass sitting on the nightstand and the prompt correctly
// leaves it there. The test is whether an object the prompt has her HANDLE actually exists in the
// scene at all. Deliberately a closed list of common, unambiguous nouns: this deterministic layer
// only needs to be right, not exhaustive — the open-ended cases are exactly what layer 2 is for.
export const MANIPULABLE_OBJECTS: Array<{ id: string; pattern: RegExp; synonyms: RegExp }> = [
  { id: "drinking_vessel", pattern: /\b(glass tilts|rim touches lips|raising a cup|lifts? (?:the |a )?(?:cup|glass|mug)|sips? from|liquid follows gravity|liquid level changes)\b/i, synonyms: /\b(glass|cup|mug|coupe|tumbler|espresso|wine|champagne|coffee|drink)\b/i },
  { id: "bottle", pattern: /\b(unscrews?|uncaps?|lifts? (?:the |a )?bottle|drinks? from the bottle)\b/i, synonyms: /\bbottle\b/i },
  { id: "phone", pattern: /\b(picks? up (?:her |the )?phone|scrolls?|taps? (?:the |her )?screen|holds? (?:up )?(?:her |the )?phone)\b/i, synonyms: /\bphone\b/i },
  { id: "book", pattern: /\b(turns? (?:the |a )?page|opens? (?:the |a )?book|closes? (?:the |a )?book)\b/i, synonyms: /\bbook\b/i },
  { id: "cigarette", pattern: /\b(lights? (?:a |the )?cigarette|exhales? smoke|drags? on)\b/i, synonyms: /\b(cigarette|lighter)\b/i },
  { id: "keys", pattern: /\b(turns? (?:the |her )?keys?|jangles?|unlocks?)\b/i, synonyms: /\b(key card|keys?|keycard)\b/i },
];

export interface SceneSemantics {
  locationClass: LocationClass;
  actionClass: ActionClass;
  // Everything the scene brief says is physically present — allowed_props plus the wardrobe lock
  // plus the spatial setup. Lowercased free text; MANIPULABLE_OBJECTS.synonyms is matched against
  // it rather than against a parsed noun list, because the briefs describe props in full sentences.
  entityText: string;
  // Is speaking the POINT of this video, as opposed to something a generator bolted on? Defaults
  // to false: an aesthetic lifestyle reel is silent unless the brief says otherwise.
  speechIsThePoint: boolean;
  // true when these values were authored by the brief, false when derived from prose here.
  authored: boolean;
}

export interface SceneSemanticsSource {
  spatial_setup?: string | null;
  location_constraints?: string[] | null;
  allowed_props?: string[] | null;
  wardrobe_lock?: string | null;
  location_class?: LocationClass | null;
  action_class?: ActionClass | null;
  scene_entities?: string[] | null;
  speech_is_the_point?: boolean | null;
}

// `sceneLocation` is chs_story_days.location — the human location line, which is often more
// explicit about the KIND of place than spatial_setup's furniture inventory ("interior of a luxury
// grand tourer" vs. a paragraph about quilted leather). `activityHint` is the day's action text
// (situation.activity, narrative, or the archetype's own action) when one is available.
export function resolveSceneSemantics(
  brief: SceneSemanticsSource,
  opts: { sceneLocation?: string | null; activityHint?: string | null } = {}
): SceneSemantics {
  const authored = !!(brief.location_class && brief.action_class);

  const locationText = [opts.sceneLocation, brief.spatial_setup, ...(brief.location_constraints ?? [])]
    .filter(Boolean)
    .join(" \n ");

  const entityText = [
    brief.spatial_setup,
    brief.wardrobe_lock,
    ...(brief.allowed_props ?? []),
    ...(brief.scene_entities ?? []),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  return {
    locationClass: brief.location_class ?? classifyLocation(locationText),
    actionClass:
      brief.action_class ??
      classifyAction([opts.activityHint, opts.sceneLocation, brief.spatial_setup].filter(Boolean).join(" \n ")),
    entityText,
    speechIsThePoint: brief.speech_is_the_point === true,
    authored,
  };
}

// The ambience phrase this location should get. Replaces the substring lookup in
// videoSections.ts's buildAudioSection().
export const AUDIO_PHRASE_FOR_CLASS: Record<AudioClass, string> = {
  room_tone: "natural room tone",
  bathroom_reverb: "bathroom reverb",
  kitchen_tone: "natural room tone",
  car_cabin: "car cabin ambience",
  mall_reverb: "mall reverb",
  gym_studio: "studio room tone",
  cafe_murmur: "cafe murmur",
  bar_murmur: "bar murmur",
  outdoor: "outdoor ambience",
  water: "water lapping",
};

export function ambiencePhraseForLocation(locationClass: LocationClass): string {
  const allowed = AUDIO_CLASSES_BY_LOCATION[locationClass];
  return AUDIO_PHRASE_FOR_CLASS[allowed[0]];
}

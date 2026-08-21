// Luxury World doctrine — F1 (FÁZA 1)
// Single source of truth for how Vivienne's world looks: premium materials, editorial locations,
// never generic/rented/mass-market. All locations/environments must read as genuinely luxe.

export const LUXURY_MATERIALS = [
  "travertine",
  "honed marble",
  "brushed brass",
  "aged oak",
  "walnut",
  "natural linen",
  "raw silk",
  "hand-glazed ceramic",
  "limestone",
  "boucle upholstery",
  "smoked glass",
  "patinated bronze",
  "teak",
  "cream leather",
  "wool felt",
  "heritage tile",
  "alabaster",
];

// Mandatory environmental quality doctrine — injected into story and scene brief prompts
export const LUXURY_ENVIRONMENT_DOCTRINE = `ENVIRONMENT QUALITY (mandatory):
Every location must read as genuinely premium — quiet, editorial luxury, never rented-Airbnb generic.
Surfaces and materials are named concretely (travertine, honed marble, aged oak, brushed brass, natural linen, limestone).
Interiors: architectural light, generous proportions, curated minimal objects, real plants or cut flowers, no clutter.
Exteriors: private terraces, infinity pool edges with stone coping, mature gardens, historic facades, coastal stone paths.
NEVER: bare concrete balconies, plastic furniture, cheap tiling, fluorescent corridors, cluttered counters, visible cables, generic hotel-chain rooms, worn or stained surfaces, crowd-barrier railings.`;

// Negatives specifically for luxury-gating (used in contextualImageNegatives when luxury_world_v1 is on)
export const LUXURY_NEGATIVES = [
  "cheap interior",
  "bare concrete balcony",
  "plastic furniture",
  "generic hotel room",
  "cluttered background",
  "worn surfaces",
  "fluorescent office lighting",
  "mass-market decor",
  "IKEA furniture",
  "visible logos or branding",
  "temporary setup",
  "rentable apartment look",
];

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildStylingRule } from "@/lib/sceneBrief";

// The failure this guards against, observed in production on 2026-08-01: a
// vacation_beach_water day whose story resolved to a gym pulled the beach_club
// styling profile, and the old rule ("the styling category must be preserved")
// locked a bikini, a waist chain and bare feet onto a rubber weights floor.
const BEACH_CLUB = {
  label: "Beach club",
  vibe: "sun-warm, unhurried, expensive-easy",
  outfit: "triangle bikini top, linen open shirt, bare legs",
  hair: "salt-textured beach waves",
  jewelry: "fine gold chain, layered anklet",
  makeup: "bare, sun-flushed",
};
const GYM = "gym — free weights section, mirror wall, mid-morning";

describe("buildStylingRule", () => {
  const rule = buildStylingRule(BEACH_CLUB, GYM);

  it("keeps the profile itself in the prompt", () => {
    expect(rule).toContain("Beach club");
    expect(rule).toContain(BEACH_CLUB.outfit);
    expect(rule).toContain(BEACH_CLUB.hair);
  });

  it("makes the location win and names the actual location", () => {
    expect(rule).toContain("THE LOCATION WINS");
    expect(rule).toContain(GYM);
  });

  it("no longer orders the styling category to be preserved", () => {
    expect(rule).not.toMatch(/styling category must be preserved/i);
    expect(rule).not.toMatch(/if it says beach club, she is in beach club attire/i);
  });

  it("tells the model to swap implausible garments while keeping the profile's character", () => {
    expect(rule).toMatch(/implausible/i);
    expect(rule).toMatch(/beach club attire in a\s*\n?gym/i);
    expect(rule).toMatch(/swap the garments/i);
    expect(rule).toMatch(/colour palette, fabrics, silhouette/i);
  });

  it("still blocks the generic slip-dress fallback", () => {
    expect(rule).toMatch(/slip dress is NOT today's look/i);
    expect(rule).toMatch(/stay recognisably\s*\n?within today's profile/i);
  });

  it("keeps the sacred-details accessories line", () => {
    expect(rule).toMatch(/sacred_details \(gold chain, earrings\)/);
  });
});

// The output looked drab and roughly a decade old — "80s bungalow kitchen", "IKEA
// showroom", no colour. The brief said WHAT was in the room but never WHEN or in what
// taste, and every worked example in the schema was industrial: a Shinagawa underground
// passage, concrete pillars, fluorescent strip lights, a charcoal late-90s wool coat,
// and a palette whose sample tokens were 'charcoal' and 'concrete grey'. Image models
// anchor hard on worked examples, so that was the world being described.
describe("era and taste", () => {
  const src = readFileSync(new URL("./sceneBrief.ts", import.meta.url), "utf8");

  it("states the era and taste positively, not only as bans", () => {
    expect(src).toMatch(/ERA AND TASTE/);
    expect(src).toMatch(/styled the way someone with taste actually lives today/i);
    expect(src).toMatch(/There is real COLOUR in the frame/i);
  });

  it("names the dated defaults an image model falls back to", () => {
    expect(src).toMatch(/1980s\/1990s builder kitchens/i);
    expect(src).toMatch(/flat-pack showroom/i);
    expect(src).toMatch(/quiet must never come out as grey, tired or institutional/i);
  });

  it("no longer anchors the schema on industrial worked examples", () => {
    expect(src).not.toMatch(/Shinagawa station underground passage/);
    expect(src).not.toMatch(/charcoal wool coat \(knee-length, late-90s cut\)/);
    expect(src).not.toMatch(/overhead fluorescent, harsh, neutral white/);
    expect(src).not.toMatch(/escalator descends to her left/);
  });

  it("actually reaches the system prompt, not just the file", () => {
    // Same trap as the animal lock: declaring the block is worthless if it is never
    // interpolated into the template that is sent to the model.
    expect(src).toMatch(/const contemporaryWorld = /);
    expect(src).toMatch(/\$\{contemporaryWorld\}/);
  });

  it("requires at least one real colour in the palette", () => {
    expect(src).toMatch(/At least ONE must be an actual colour, not a neutral/i);
    expect(src).toMatch(/never instead of one/i);
  });
});

// Production 2026-08-01: a pets_spontaneous day rendered a solid blue-grey British
// Shorthair in one slot and a brown tabby in the next. Wardrobe and props were locked
// exhaustively; the animal had no lock at all, so each slot invented its own cat.
describe("pet_lock continuity", () => {
  const sceneBriefSrc = readFileSync(new URL("./sceneBrief.ts", import.meta.url), "utf8");
  const slotPromptsSrc = readFileSync(new URL("./slotPrompts.ts", import.meta.url), "utf8");

  it("the brief schema asks for an exhaustive single-animal lock", () => {
    expect(sceneBriefSrc).toContain('"pet_lock"');
    expect(sceneBriefSrc).toMatch(/ONLY if an animal appears/i);
    expect(sceneBriefSrc).toMatch(/breed, exact coat colour and pattern/i);
    expect(sceneBriefSrc).toMatch(/never changes colour, breed, size or count between slots/i);
  });

  it("stays optional so briefs stored before the field still typecheck", () => {
    expect(sceneBriefSrc).toMatch(/pet_lock\?: string/);
  });

  it("slot prompts carry the animal lock through to every slot", () => {
    expect(slotPromptsSrc).toContain("sceneBriefJson.pet_lock");
    expect(slotPromptsSrc).toMatch(/SAME individual animal in every slot/i);
    expect(slotPromptsSrc).toMatch(/never be a DIFFERENT one/i);
  });
});

// Production 2026-08-01: reel_start_frame and story_bts (same day, same shared scene brief)
// rendered different distant skylines even though wardrobe/props/foreground were locked
// exhaustively — the brief's own spatial_setup/location_constraints described the background only
// as "low-rise rooflines, 2 to 4 storeys of buildings", generic enough that two independent
// Higgsfield calls still invented different architecture. Reuses lib/shotDirection.ts's
// ensureEnvironmentAnchored (same mechanism verified this session on the Fanvue side) rather than
// a second implementation.
describe("environment anchor continuity (Instagram daily-batch pipeline)", () => {
  const sceneBriefSrc = readFileSync(new URL("./sceneBrief.ts", import.meta.url), "utf8");
  const slotPromptsSrc = readFileSync(new URL("./slotPrompts.ts", import.meta.url), "utf8");

  it("imports and applies the shared environment anchor to spatial_setup before returning the brief", () => {
    expect(sceneBriefSrc).toMatch(/import \{ ensureEnvironmentAnchored \} from "@\/lib\/shotDirection"/);
    expect(sceneBriefSrc).toMatch(/ensureEnvironmentAnchored\(json\.spatial_setup\)/);
  });

  it("also pushes the anchor detail into location_constraints, not just spatial_setup", () => {
    expect(sceneBriefSrc).toMatch(/json\.location_constraints = \[\.\.\.json\.location_constraints, anchorDetail\]/);
  });

  it("applies the anchor once, before the brief is persisted/shared — not per-slot in lib/slotPrompts.ts", () => {
    expect(slotPromptsSrc).not.toMatch(/ensureEnvironmentAnchored/);
  });

  // Real regression found while verifying the first version of this fix on real production data
  // (2026-08-02): the anchor WAS present in spatial_setup/location_constraints for both slots, but
  // reel_start_frame's per-slot Claude rewrite kept it while story_bts's compressed it away — the
  // shared brief being anchored was not sufficient, because lib/slotPrompts.ts's
  // generateSlotPrompt() is itself a free per-slot Claude rewrite, not a deterministic template.
  it("exposes environment_anchor as its own SceneBriefJson field, not just buried in location_constraints", () => {
    expect(sceneBriefSrc).toMatch(/environment_anchor\?:\s*string/);
    expect(sceneBriefSrc).toMatch(/json\.environment_anchor = anchorDetail/);
  });

  it("commonBody() surfaces environment_anchor as an explicit MANDATORY instruction, not an optional bullet", () => {
    expect(slotPromptsSrc).toMatch(/sceneBriefJson\.environment_anchor/);
    expect(slotPromptsSrc).toMatch(/BACKGROUND ARCHITECTURE \(MANDATORY/);
  });

  it("captionBody() (the compact doctrine path) also surfaces environment_anchor as mandatory", () => {
    // captionBody is a separate, shorter prompt builder (see its own doc comment: "Full commonBody()
    // ... overwhelms short-prompt instructions") — the mandatory instruction must reach both paths
    // independently, not rely on commonBody's wiring alone.
    const captionBodyMatch = slotPromptsSrc.match(/function captionBody\([\s\S]*?\n\}/);
    expect(captionBodyMatch).not.toBeNull();
    expect(captionBodyMatch![0]).toMatch(/sceneBriefJson\.environment_anchor/);
    expect(captionBodyMatch![0]).toMatch(/MANDATORY/);
  });
});

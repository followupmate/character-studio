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

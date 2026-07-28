import { describe, it, expect } from "vitest";
import { STYLING_PROFILES, MAGNETIC_STYLING_PROFILES, SEX_APPEAL_STYLING_PROFILES, LUXURY_SEDUCTION_STYLING_PROFILES, SAFE_TAME_IDS, selectStylingSourcePool } from "./stylingDeck";

// sensual_visual_language_v1 (iteration 2) — a production dry-run collage skewed toward
// sweaters/robes/joggers/neutral gym sets. selectStylingSourcePool is the pure half of
// pickStylingProfile (which is otherwise entirely DB-bound, same as pickTier) — extracted
// specifically so the pool-selection logic is unit-testable without a Supabase mock.

describe("selectStylingSourcePool — magnetic pool substitution", () => {
  it("without useMagneticPool (or omitted), returns exactly STYLING_PROFILES — byte-identical to iteration 1", () => {
    expect(selectStylingSourcePool()).toEqual(STYLING_PROFILES);
    expect(selectStylingSourcePool(false)).toEqual(STYLING_PROFILES);
  });

  it("with useMagneticPool, excludes every SAFE_TAME_IDS profile", () => {
    const pool = selectStylingSourcePool(true);
    for (const id of SAFE_TAME_IDS) {
      expect(pool.some((p) => p.id === id)).toBe(false);
    }
  });

  it("with useMagneticPool, includes MAGNETIC_STYLING_PROFILES entries", () => {
    const pool = selectStylingSourcePool(true);
    for (const p of MAGNETIC_STYLING_PROFILES) {
      expect(pool).toContainEqual(p);
    }
  });

  it("with useMagneticPool, still includes non-SAFE_TAME_IDS existing profiles (e.g. bedroom_lingerie, vs_glamour)", () => {
    const pool = selectStylingSourcePool(true);
    expect(pool.some((p) => p.id === "bedroom_lingerie")).toBe(true);
    expect(pool.some((p) => p.id === "vs_glamour")).toBe(true);
  });

  it("MAGNETIC_STYLING_PROFILES covers everyday_life/lived_moments, wellness_fitness, and intimate_aesthetic", () => {
    const tiers = new Set(MAGNETIC_STYLING_PROFILES.flatMap((p) => p.tier_affinity));
    expect(tiers.has("everyday_life")).toBe(true);
    expect(tiers.has("lived_moments")).toBe(true);
    expect(tiers.has("wellness_fitness")).toBe(true);
    expect(tiers.has("intimate_aesthetic")).toBe(true);
  });
});

describe("selectStylingSourcePool — time/weather compatibility filter", () => {
  it("filters by time_affinity, falling back to the unfiltered pool if the filter would empty it", () => {
    const withTime = selectStylingSourcePool(false, { timeOfDay: "morning" });
    for (const p of withTime) {
      expect(p.time_affinity.includes("morning") || p.time_affinity.includes("any")).toBe(true);
    }
    // Never returns an empty pool.
    expect(withTime.length).toBeGreaterThan(0);
  });

  it("filters out outdoor_warm-only magnetic profiles in cold/rainy weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "cold and raining" });
    const denimShorts = pool.find((p) => p.id === "denim_shorts_day"); // weather_affinity: ["outdoor_warm"] only
    expect(denimShorts).toBeUndefined();
  });

  it("keeps indoor-tagged profiles when the situation's weather is literally 'indoor'", () => {
    const pool = selectStylingSourcePool(true, { weather: "indoor" });
    expect(pool.some((p) => p.id === "satin_slip_dress")).toBe(true); // weather_affinity: ["indoor"]
  });

  it("never fully empties the magnetic pool in cold weather — falls back to non-weather-tagged profiles rather than STYLING_PROFILES only", () => {
    // None of the new magnetic profiles are tagged outdoor_cool by design (sensual looks skew
    // indoor/outdoor_warm) — in cold weather the cascade still returns a non-empty pool because
    // existing STYLING_PROFILES entries (no weather_affinity at all) are always compatible.
    const pool = selectStylingSourcePool(true, { weather: "cold and raining" });
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some((p) => p.id === "denim_shorts_day")).toBe(false); // outdoor_warm only — correctly excluded
  });

  it("profiles without weather_affinity are always compatible (existing STYLING_PROFILES entries)", () => {
    const pool = selectStylingSourcePool(false, { weather: "cold and raining" });
    expect(pool).toEqual(STYLING_PROFILES);
  });

  it("never returns an empty pool even when both filters would otherwise empty it", () => {
    const pool = selectStylingSourcePool(true, { timeOfDay: "dawn", weather: "cold and snowing" });
    expect(pool.length).toBeGreaterThan(0);
  });

  it("without situationContext, time/weather filtering is skipped entirely", () => {
    expect(selectStylingSourcePool(true)).toEqual(selectStylingSourcePool(true, undefined));
  });
});

// sex_appeal_style_v1 (iteration 3) — a live 14-day run still read as "attractive lifestyle
// profile", partly because the situation planner's declared outfit_archetype had zero influence
// on which StylingProfile actually got picked (e.g. "satin slip dress" repeated 6/14 days
// regardless of what the planner said that day). SEX_APPEAL_STYLING_PROFILES + outfitFamilyHint
// close that gap.
describe("selectStylingSourcePool — sex-appeal pool substitution", () => {
  it("without useSexAppealPool, SEX_APPEAL_STYLING_PROFILES entries are never included even with useMagneticPool", () => {
    const pool = selectStylingSourcePool(true, undefined, false);
    for (const p of SEX_APPEAL_STYLING_PROFILES) {
      expect(pool).not.toContainEqual(p);
    }
  });

  it("with useMagneticPool + useSexAppealPool, includes SEX_APPEAL_STYLING_PROFILES entries in addition to the magnetic pool", () => {
    const pool = selectStylingSourcePool(true, undefined, true);
    for (const p of MAGNETIC_STYLING_PROFILES) expect(pool).toContainEqual(p);
    for (const p of SEX_APPEAL_STYLING_PROFILES) expect(pool).toContainEqual(p);
  });

  it("useSexAppealPool alone (without useMagneticPool) has no effect — byte-identical to STYLING_PROFILES", () => {
    expect(selectStylingSourcePool(false, undefined, true)).toEqual(STYLING_PROFILES);
  });
});

describe("selectStylingSourcePool — outfitFamilyHint cascade", () => {
  it("without outfitFamilyHint, behaves exactly as before (byte-identical to iteration 2)", () => {
    expect(selectStylingSourcePool(true, undefined, true)).toEqual(selectStylingSourcePool(true, undefined, true, undefined));
  });

  it("with outfitFamilyHint, narrows to profiles whose outfit_family matches", () => {
    const pool = selectStylingSourcePool(true, undefined, true, "bodycon_dress");
    expect(pool.length).toBeGreaterThan(0);
    for (const p of pool) {
      expect(p.outfit_family).toBe("bodycon_dress");
    }
    expect(pool.some((p) => p.id === "bodycon_mini_dress")).toBe(true);
  });

  it("falls back to the wider pool when no profile matches the hinted family", () => {
    const pool = selectStylingSourcePool(true, undefined, true, "a_family_that_does_not_exist");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toEqual(selectStylingSourcePool(true, undefined, true));
  });

  it("runs before the time/weather filters (most specific step first)", () => {
    const pool = selectStylingSourcePool(true, { weather: "cold and raining" }, true, "stockings_look");
    expect(pool.some((p) => p.outfit_family === "stockings_look")).toBe(true);
  });
});

describe("selectStylingSourcePool — stockings/blazer weather guardrail (doplnenie #3)", () => {
  it("stockings_enhanced_look never appears in beach/outdoor_warm weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "hot and sunny" }, true);
    expect(pool.some((p) => p.id === "stockings_enhanced_look")).toBe(false);
  });

  it("blazer_bare_legs never appears in beach/outdoor_warm weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "hot and sunny" }, true);
    expect(pool.some((p) => p.id === "blazer_bare_legs")).toBe(false);
  });

  it("stockings_enhanced_look has no vacation_beach_water family_affinity", () => {
    const profile = SEX_APPEAL_STYLING_PROFILES.find((p) => p.id === "stockings_enhanced_look");
    expect(profile?.family_affinity?.includes("vacation_beach_water")).toBeFalsy();
  });

  it("stockings_enhanced_look is present in indoor weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "indoor" }, true);
    expect(pool.some((p) => p.id === "stockings_enhanced_look")).toBe(true);
  });
});

describe("SEX_APPEAL_STYLING_PROFILES", () => {
  it("every entry has an outfit_family tag", () => {
    for (const p of SEX_APPEAL_STYLING_PROFILES) {
      expect(typeof p.outfit_family).toBe("string");
      expect(p.outfit_family!.length).toBeGreaterThan(0);
    }
  });
});

// luxury_seduction_v1 (iteration 4) — a live 14-day run showed slip_dress/swimwear_coverup
// repeating 3x/14 despite soft anti-repeat; investigation found single-entry outfit_family pools
// are a DETERMINISTIC-RENDERING trap independent of anti-repeat (once outfitFamilyHint narrows
// the pool to one entry, every cooldown-respecting cascade step still resolves to that same lone
// item). Fixed by adding a second, stylistically distinct sibling entry to every family that
// previously had exactly one.
describe("LUXURY_SEDUCTION_STYLING_PROFILES", () => {
  it("every entry has an outfit_family tag", () => {
    for (const p of LUXURY_SEDUCTION_STYLING_PROFILES) {
      expect(typeof p.outfit_family).toBe("string");
      expect(p.outfit_family!.length).toBeGreaterThan(0);
    }
  });

  it("previously single-entry families now have >= 2 deck entries across all pools", () => {
    const allProfiles = [...STYLING_PROFILES, ...MAGNETIC_STYLING_PROFILES, ...SEX_APPEAL_STYLING_PROFILES, ...LUXURY_SEDUCTION_STYLING_PROFILES];
    const previouslyThinFamilies = ["bodycon_dress", "sheath_pencil_dress", "cocktail_dress", "stockings_look", "evening_dress", "nightlife_top", "slip_dress", "swimwear_coverup"];
    for (const family of previouslyThinFamilies) {
      const count = allProfiles.filter((p) => p.outfit_family === family).length;
      expect(count, `family "${family}" should have >= 2 deck entries`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every entry has genuinely distinct label text from its sibling within the same family", () => {
    const byFamily = new Map<string, string[]>();
    for (const p of [...MAGNETIC_STYLING_PROFILES, ...SEX_APPEAL_STYLING_PROFILES, ...LUXURY_SEDUCTION_STYLING_PROFILES]) {
      if (!p.outfit_family) continue;
      const labels = byFamily.get(p.outfit_family) ?? [];
      labels.push(p.label);
      byFamily.set(p.outfit_family, labels);
    }
    for (const [family, labels] of byFamily) {
      expect(new Set(labels).size, `family "${family}" has duplicate labels: ${labels.join(", ")}`).toBe(labels.length);
    }
  });
});

describe("selectStylingSourcePool — luxury pool substitution", () => {
  it("without useLuxurySeductionPool, LUXURY_SEDUCTION_STYLING_PROFILES entries are never included even with useSexAppealPool", () => {
    const pool = selectStylingSourcePool(true, undefined, true, undefined, false);
    for (const p of LUXURY_SEDUCTION_STYLING_PROFILES) {
      expect(pool).not.toContainEqual(p);
    }
  });

  it("with useLuxurySeductionPool, includes LUXURY_SEDUCTION_STYLING_PROFILES entries in addition to the sex-appeal + magnetic pools", () => {
    const pool = selectStylingSourcePool(true, undefined, true, undefined, true);
    for (const p of MAGNETIC_STYLING_PROFILES) expect(pool).toContainEqual(p);
    for (const p of SEX_APPEAL_STYLING_PROFILES) expect(pool).toContainEqual(p);
    for (const p of LUXURY_SEDUCTION_STYLING_PROFILES) expect(pool).toContainEqual(p);
  });

  it("useLuxurySeductionPool alone (without useMagneticPool) has no effect — byte-identical to STYLING_PROFILES", () => {
    expect(selectStylingSourcePool(false, undefined, false, undefined, true)).toEqual(STYLING_PROFILES);
  });
});

describe("selectStylingSourcePool — luxury outfitFamilyHint cascade", () => {
  it("narrows to a new luxury-only family (e.g. structured_blazer_dress)", () => {
    const pool = selectStylingSourcePool(true, undefined, true, "structured_blazer_dress", true);
    expect(pool.length).toBeGreaterThan(0);
    for (const p of pool) expect(p.outfit_family).toBe("structured_blazer_dress");
    expect(pool.some((p) => p.id === "structured_blazer_dress_luxury")).toBe(true);
  });

  it("narrows to a previously-thin family and now finds BOTH sibling entries", () => {
    const pool = selectStylingSourcePool(true, undefined, true, "slip_dress", true);
    expect(pool.some((p) => p.id === "satin_slip_dress")).toBe(true);
    expect(pool.some((p) => p.id === "slip_dress_luxury")).toBe(true);
  });
});

describe("selectStylingSourcePool — stockings_look_luxury weather guardrail (doplnenie #3, iteration 4)", () => {
  it("stockings_look_luxury never appears in beach/outdoor_warm weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "hot and sunny" }, true, undefined, true);
    expect(pool.some((p) => p.id === "stockings_look_luxury")).toBe(false);
  });

  it("stockings_look_luxury is present in indoor weather", () => {
    const pool = selectStylingSourcePool(true, { weather: "indoor" }, true, undefined, true);
    expect(pool.some((p) => p.id === "stockings_look_luxury")).toBe(true);
  });

  it("stockings_look_luxury has no vacation_beach_water family_affinity", () => {
    const profile = LUXURY_SEDUCTION_STYLING_PROFILES.find((p) => p.id === "stockings_look_luxury");
    expect(profile?.family_affinity?.includes("vacation_beach_water")).toBeFalsy();
  });
});

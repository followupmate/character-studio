import { describePatternLabel } from "./contentConcept";
import { describeWinningAxis } from "./describeBreakdown";
import type { ContentPattern, WhatIsWorkingInsight } from "./types";

// What Is Working (C): describes proven patterns with whatever real tagging dimensions they
// actually have — tier, moment_family, location/location_family, activity, framing
// (shot_archetype), mood, sexual_energy_level. Never invents a more specific pattern than the
// data supports; when most dimensions are null (common for older, pre-detailed-tagging posts),
// says so explicitly instead of pretending a bare tier is a detailed insight.

// Below this many populated dimensions (beyond tier itself), the pattern is honestly "just a
// tier", not a specific creative direction — the UI needs to know when to show the fallback note.
const SPECIFIC_DIMENSION_THRESHOLD = 2;

export function describeWhatIsWorking(patterns: ContentPattern[], limit = 5): WhatIsWorkingInsight[] {
  const proven = patterns.filter((p) => p.status === "proven").slice(0, limit);

  return proven.map((pattern) => {
    const { label, specificDimensionCount } = describePatternLabel(pattern.descriptor);
    const detail = pattern.performance ? describeWinningAxis(pattern.performance) : "No performance data available.";

    return {
      pattern_id: pattern.id,
      label,
      detail,
      platform_index: pattern.performance?.platform_composite_index ?? null,
      business_index: pattern.performance?.business_conversion_index ?? null,
      confidence_score: pattern.confidence_score,
      sample_size: pattern.performance?.sample_size ?? 0,
      tagging_note:
        specificDimensionCount < SPECIFIC_DIMENSION_THRESHOLD
          ? "Not enough historical tagging to identify a more specific pattern yet."
          : undefined,
    };
  });
}

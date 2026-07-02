// Platform normalization — extracted from the create route so the mapping is
// unit-testable (the old inline version silently dropped "X/Twitter").

export const PLATFORM_MAP: Record<string, string> = {
  "instagram": "instagram",
  "tiktok":    "tiktok",
  "youtube":   "youtube",
  "x/twitter": "x",
  "twitter":   "x",
  "x":         "x",
};

// Wizard labels ("Instagram", "X/Twitter") → DB platform slugs; unknown → dropped.
export function mapPlatforms(labels: string[]): string[] {
  return labels
    .map((p) => PLATFORM_MAP[p.toLowerCase().trim()])
    .filter((p): p is string => !!p);
}

// Shared window-resolution for the dashboard's 7/30/90/all-time toggle (used by both
// analyze/route.ts and strategy/route.ts so they interpret the same query params identically).
export const WINDOW_OPTIONS = ["7", "30", "90", "all"] as const;
export type WindowOption = (typeof WINDOW_OPTIONS)[number];

// Large enough to cover any realistic account history; import-insights only refreshes 90 days
// deep, so "all-time" here means "everything ever scored", not "everything IG has ever seen".
const ALL_TIME_DAYS = 36500;

export function resolveWindowDays(url: URL): number {
  const window = url.searchParams.get("window");
  if (window === "all") return ALL_TIME_DAYS;
  if (window === "7" || window === "30" || window === "90") return Number(window);

  const days = Number(url.searchParams.get("days"));
  if (Number.isFinite(days) && days > 0) return Math.min(days, ALL_TIME_DAYS);
  return 30;
}

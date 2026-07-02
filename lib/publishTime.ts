// Scheduling helper for the publish queue — extracted from from-batch so the
// past-date edge case is unit-testable.

// Build the scheduled_at ISO for a post: character's posting_time on the given
// date (UTC) + offset. Never schedules into the past — pushes to "now + 1 min".
export function scheduledIso(dateStr: string, postingTime: string, offsetMinutes = 0, now: number = Date.now()): string {
  // Parse "HH:MM" (also tolerates Postgres "HH:MM:SS"). The old `h ?? 10` fallback
  // never fired: Number("") is 0, and a non-numeric value produced an Invalid Date.
  const match = /^(\d{1,2}):(\d{2})/.exec(postingTime.trim());
  const h = match && Number(match[1]) <= 23 ? Number(match[1]) : 10;
  const m = match && Number(match[2]) <= 59 ? Number(match[2]) : 0;
  const dt = new Date(`${dateStr}T00:00:00.000Z`);
  dt.setUTCHours(h, m, 0, 0);
  dt.setUTCMinutes(dt.getUTCMinutes() + offsetMinutes);
  if (dt.getTime() < now) {
    return new Date(now + 60_000).toISOString();
  }
  return dt.toISOString();
}

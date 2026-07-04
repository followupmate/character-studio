import { NextResponse } from "next/server";

// Shared cron/server-to-server auth. Single source of truth for what were six
// slightly divergent isAuthorized() copies.
//
// FAIL-CLOSED: if CRON_SECRET is not set, access is DENIED (the old copies
// returned true here, so one missing env silently opened every cron route).
// The secret arrives either as `Authorization: Bearer <secret>` (Vercel cron,
// server-to-server) or `?secret=<secret>` (cron-job.org external scheduler).

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

// Guard helper: returns a 401 Response to short-circuit with, or null to proceed.
//   const deny = requireCron(req); if (deny) return deny;
export function requireCron(req: Request): NextResponse | null {
  if (cronAuthorized(req)) return null;
  const reason = process.env.CRON_SECRET ? "Unauthorized" : "CRON_SECRET not configured";
  return NextResponse.json({ error: reason }, { status: 401 });
}

import { NextResponse } from "next/server";
import { requireCron } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel cron: ensure today's batch slots are queued as chs_posts.
// Actual posting is dispatched separately by /api/publish/cron
// (cron-job.org every 15 min) so this endpoint stays lightweight.
export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  try {
    const origin =
      req.headers.get("x-forwarded-host")
        ? `https://${req.headers.get("x-forwarded-host")}`
        : process.env.APP_URL ?? "http://localhost:3000";

    const secret = process.env.CRON_SECRET;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const fromBatchRes = await fetch(`${origin}/api/publish/from-batch`, {
      method: "POST",
      headers,
    });
    const fromBatchData = await fromBatchRes.json();

    return NextResponse.json({
      success: fromBatchRes.ok,
      from_batch: fromBatchData,
    });
  } catch (error) {
    console.error("[characters/publish]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) { return GET(req); }

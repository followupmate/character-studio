import { NextResponse } from "next/server";
import { requireCron } from "@/lib/apiAuth";
import { getIgAccessToken, saveIgAccessToken } from "@/lib/igToken";

export const runtime = "nodejs";
export const maxDuration = 30;

// Keeps the Instagram long-lived token alive so the account never silently stops
// posting. IG tokens last ~60 days; refresh_access_token extends by another 60
// (the token must be >24h old and still valid). Runs weekly from vercel.json, so
// there's a wide margin — many chances to refresh before the 60-day cliff.
async function handle(req: Request): Promise<NextResponse> {
  const deny = requireCron(req);
  if (deny) return deny;

  const token = await getIgAccessToken();
  if (!token) {
    return NextResponse.json({ success: false, error: "No IG token to refresh" }, { status: 500 });
  }

  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!res.ok || !data.access_token) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    console.error("[refresh-ig-token]", msg);
    // Non-fatal: the existing token stays valid until it actually expires, so a
    // failed refresh just means we retry next week — surface it but don't 500 hard.
    return NextResponse.json({ success: false, error: msg }, { status: 502 });
  }

  await saveIgAccessToken(data.access_token, data.expires_in);
  const days = data.expires_in ? Math.round(data.expires_in / 86400) : null;
  console.log(`[refresh-ig-token] refreshed, valid ~${days} days`);
  return NextResponse.json({ success: true, expires_in_days: days });
}

export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }

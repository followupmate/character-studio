import { NextResponse } from "next/server";
import { requireCron } from "@/lib/apiAuth";
import { checkTokenHealth, errMessage, resolveFbPageToken, type TokenHealth } from "@/lib/fbToken";

export const runtime = "nodejs";
export const maxDuration = 30;

// Cron-safe, read-only health check of the Facebook tokens used by the trending-audio publish path
// (lib/igReelAudioPublish.ts). Calls debug_token only. NEVER returns or logs a token.
// Not registered in vercel.json — call it by hand or from an external scheduler (same auth as the
// other crons: requireCron). Response: 200 when every configured token is ok/never_expires,
// 503 otherwise (so an uptime monitor can alert), 200 + configured:false when nothing is set up.
export async function GET(req: Request) {
  const deny = requireCron(req);
  if (deny) return deny;

  const tokens: Record<string, TokenHealth | { status: "unconfigured" } | { status: "unknown"; detail: string }> = {};
  const userToken = process.env.FB_LONG_LIVED_USER_TOKEN?.trim();
  try {
    const page = await resolveFbPageToken();
    tokens.page_token = page ? await checkTokenHealth(page.token) : { status: "unconfigured" };
  } catch (e) {
    tokens.page_token = { status: "unknown", detail: errMessage(e) };
  }
  tokens.long_lived_user_token = userToken ? await checkTokenHealth(userToken) : { status: "unconfigured" };

  const statuses = Object.values(tokens).map((t) => t.status);
  const configured = statuses.some((s) => s !== "unconfigured");
  const ok = statuses.every((s) => s === "ok" || s === "never_expires" || s === "unconfigured");
  return NextResponse.json(
    { ok: configured ? ok : true, configured, igUserIdSet: !!process.env.FB_IG_USER_ID, tokens },
    { status: configured && !ok ? 503 : 200 }
  );
}

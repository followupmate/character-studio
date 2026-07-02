import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fanvueConfigured, fetchFanvueSnapshot } from "@/lib/fanvue";

export const runtime = "nodejs";
export const maxDuration = 60;

// MONEY ENGINE auto-refresh — pulls the Fanvue account snapshot (followers,
// subscribers, earnings) via the OAuth API and writes it to
// chs_characters.fanvue_snapshot, replacing the manual MCP audit. Runs daily
// from vercel.json cron (19:45 UTC, before the dashboard's evening check).
//
// Existing snapshot fields the API sync doesn't cover (post_count, smart_lists…)
// are preserved by the merge, so a manual MCP audit stays compatible.

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!fanvueConfigured()) {
    return NextResponse.json({ error: "FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET nie sú nastavené" }, { status: 500 });
  }

  try {
    const snapshot = await fetchFanvueSnapshot();

    // The OAuth token belongs to one creator account. Map it to the character(s)
    // with fanvue_link set; if none has a link yet, fall back to all active ones.
    const { data: characters } = await supabase
      .from("chs_characters")
      .select("id, name, fanvue_link, fanvue_snapshot")
      .eq("is_active", true);

    const withLink = (characters ?? []).filter((c) => !!c.fanvue_link);
    const targets = withLink.length > 0 ? withLink : (characters ?? []);

    const updated: string[] = [];
    for (const c of targets) {
      const merged = { ...(c.fanvue_snapshot as Record<string, unknown> ?? {}), ...snapshot };
      const { error } = await supabase
        .from("chs_characters")
        .update({ fanvue_snapshot: merged })
        .eq("id", c.id);
      if (!error) updated.push(c.name as string);
    }

    return NextResponse.json({ success: true, updated, snapshot });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

import { supabase } from "@/lib/supabase";

// Instagram long-lived access tokens expire ~60 days after issue. Keeping the
// live token in chs_oauth_tokens (provider='instagram') lets a cron refresh it
// in place — an env var can't be rewritten at runtime, which is exactly why the
// account silently stopped posting when the env token lapsed.
//
// Read order: DB first (kept fresh by the refresh cron), then the IG_ACCESS_TOKEN
// env var as a bootstrap fallback until the first refresh seeds the row.
const PROVIDER = "instagram";

export async function getIgAccessToken(): Promise<string | null> {
  const { data } = await supabase
    .from("chs_oauth_tokens")
    .select("access_token")
    .eq("provider", PROVIDER)
    .maybeSingle();
  const dbToken = (data as { access_token?: string } | null)?.access_token;
  return dbToken || process.env.IG_ACCESS_TOKEN || null;
}

export async function saveIgAccessToken(token: string, expiresInSec?: number): Promise<void> {
  const expiresAt = expiresInSec
    ? new Date(Date.now() + expiresInSec * 1000).toISOString()
    : null;
  const { error } = await supabase
    .from("chs_oauth_tokens")
    .upsert(
      {
        provider: PROVIDER,
        access_token: token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" }
    );
  if (error) throw new Error(`saveIgAccessToken failed: ${error.message}`);
}

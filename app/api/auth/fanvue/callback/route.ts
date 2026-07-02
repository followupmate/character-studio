import { NextRequest } from "next/server";
import { saveTokens } from "@/lib/fanvue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fanvue OAuth step 2 — exchange the code (with the PKCE verifier from the
// cookie) and persist tokens into chs_oauth_tokens. From here on the client
// refreshes automatically; nothing to copy into env.

function page(title: string, body: string, ok: boolean): Response {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:monospace;padding:40px;background:#0d1117;color:#e8e8f0;">
      <h1 style="color:${ok ? "#00d4aa" : "#ff6b6b"}">${title}</h1>${body}
    </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    const desc = req.nextUrl.searchParams.get("error_description") ?? "";
    return page(`Fanvue error: ${error}`, `<p>${desc}</p>`, false);
  }
  if (!code) return page("Chýba authorization code", "", false);

  const verifier = req.cookies.get("fv_verifier")?.value;
  const expectedState = req.cookies.get("fv_state")?.value;
  if (!verifier) return page("Chýba PKCE verifier", "<p>Cookie expirovala — začni znova na /api/auth/fanvue</p>", false);
  if (expectedState && state !== expectedState) return page("State mismatch", "<p>Začni znova na /api/auth/fanvue</p>", false);

  const redirectUri = `${process.env.APP_URL?.replace(/\/$/, "")}/api/auth/fanvue/callback`;
  const tokenRes = await fetch("https://auth.fanvue.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.FANVUE_CLIENT_ID!,
      client_secret: process.env.FANVUE_CLIENT_SECRET!,
      code_verifier: verifier,
    }),
  });

  const tokens = await tokenRes.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    error?: string; error_description?: string;
  };

  if (!tokenRes.ok || !tokens.access_token) {
    return page(
      `Token exchange zlyhal (${tokenRes.status})`,
      `<p>${tokens.error_description ?? tokens.error ?? "neznáma chyba"}</p>`,
      false
    );
  }

  await saveTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_in: tokens.expires_in ?? 3600,
  });

  return page(
    "Fanvue pripojené ✓",
    `<p>Tokeny sú uložené v databáze a obnovujú sa automaticky.</p>
     <p>${tokens.refresh_token ? "Refresh token: uložený ✓" : "⚠ Bez refresh tokenu — over, že scope obsahuje offline_access"}</p>
     <p><a href="/fanvue" style="color:#4a9eff">→ Späť na /fanvue</a></p>`,
    true
  );
}

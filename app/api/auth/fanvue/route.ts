import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fanvue OAuth step 1 — redirect to the authorize page. PKCE is mandatory:
// the code_verifier is kept in an httpOnly cookie until the callback.
// Prereq: app created in the Fanvue Builder area with redirect URI
// {APP_URL}/api/auth/fanvue/callback, FANVUE_CLIENT_ID/SECRET in env.

const DEFAULT_SCOPES = "offline_access read:self write:post write:media write:chat-message";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET() {
  const clientId = process.env.FANVUE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "FANVUE_CLIENT_ID chýba v env — vytvor app vo Fanvue Builder area" }, { status: 500 });
  }
  const redirectUri = `${process.env.APP_URL?.replace(/\/$/, "")}/api/auth/fanvue/callback`;

  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: process.env.FANVUE_SCOPES ?? DEFAULT_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(`https://auth.fanvue.com/oauth2/auth?${params.toString()}`);
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("fv_verifier", verifier, cookieOpts);
  res.cookies.set("fv_state", state, cookieOpts);
  return res;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");

    if (!code) {
      return new Response("<h1>Error</h1><p>Missing authorization code.</p>", {
        status: 400,
        headers: { "Content-Type": "text/html" },
      });
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        redirect_uri: `${process.env.APP_URL}/api/auth/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await res.json();

    if (!res.ok) {
      return new Response(
        `<h1>Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`,
        { status: 500, headers: { "Content-Type": "text/html" } }
      );
    }

    const refreshToken = tokens.refresh_token ?? "(none — re-run OAuth with prompt=consent)";

    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>YouTube Connected</title>
<style>
  body { font-family: monospace; max-width: 700px; margin: 60px auto; padding: 0 20px; background: #080b0f; color: #c9d1d9; }
  h1 { color: #00d4aa; }
  p { color: #8b949e; }
  code { display: block; background: #0d1117; border: 1px solid #30363d; padding: 16px; border-radius: 6px; word-break: break-all; color: #4a9eff; margin: 12px 0; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e7681; margin-top: 24px; }
</style>
</head>
<body>
  <h1>✓ YouTube Connected</h1>
  <p>Copy the refresh token below and add it to Vercel as <strong>YOUTUBE_REFRESH_TOKEN</strong>.</p>
  <p class="label">Refresh Token</p>
  <code>${refreshToken}</code>
  <p class="label">Access Token (short-lived, ignore)</p>
  <code>${tokens.access_token ?? "—"}</code>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new Response(
      `<h1>Error</h1><pre>${err instanceof Error ? err.message : String(err)}</pre>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}

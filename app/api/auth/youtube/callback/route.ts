import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return new Response(`<h1>Error: ${error}</h1>`, { headers: { 'Content-Type': 'text/html' } })
  }

  if (!code) {
    return new Response('<h1>Missing authorization code</h1>', { headers: { 'Content-Type': 'text/html' } })
  }

  const redirectUri = `${process.env.APP_URL}/api/auth/youtube/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  const tokens = await tokenRes.json()

  return new Response(`
    <!DOCTYPE html>
    <html>
    <body style="font-family:monospace; padding:40px; background:#0d1117; color:#e8e8f0;">
      <h1 style="color:#00d4aa">YouTube Connected!</h1>
      <p>Copy this refresh token to Vercel env as <strong>YOUTUBE_REFRESH_TOKEN</strong>:</p>
      <div style="background:#050709; border:1px solid #1c2430; padding:20px; margin:16px 0; word-break:break-all; color:#7ac999">
        ${tokens.refresh_token || 'NO REFRESH TOKEN - try again'}
      </div>
      <p style="color:#4a5a6a">Access token (expires in 1h): ${tokens.access_token?.slice(0, 20)}...</p>
    </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } })
}

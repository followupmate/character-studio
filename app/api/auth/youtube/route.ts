import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      redirect_uri: `${process.env.APP_URL}/api/auth/youtube/callback`,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
      access_type: "offline",
      prompt: "consent",
    });

  return NextResponse.redirect(authUrl);
}

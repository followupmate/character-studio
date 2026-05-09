import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Generation is now handled manually via Higgsfield web UI.
// Use /api/characters/save-media-url to store the result URL and mark media ready.
export async function POST() {
  return NextResponse.json({ success: true });
}

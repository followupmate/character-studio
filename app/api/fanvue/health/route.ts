import { NextResponse } from "next/server";
import { fanvueConfigured, fanvueHealth } from "@/lib/fanvue";
import { soulConfigured } from "@/lib/higgsfieldSoul";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connectivity + auth probe for the Fanvue API integration — used by /fanvue UI
// to show whether the publish arm is armed before the user tries a real publish.
export async function GET() {
  // Item 11 — proactive surfacing: soulConfigured() is a cheap, no-network format check (same
  // one app/api/fanvue/generate-media/route.ts already gates on), so the UI can show "Higgsfield
  // not configured" before the user ever clicks generate, instead of only after a 500.
  const higgsfield = { configured: soulConfigured() };

  if (!fanvueConfigured()) {
    return NextResponse.json({ configured: false, ok: false, detail: "FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET chýbajú vo Vercel env (Fanvue Builder area)", higgsfield });
  }
  const h = await fanvueHealth();
  return NextResponse.json({ configured: true, ...h, higgsfield });
}

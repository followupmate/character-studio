import { NextResponse } from "next/server";
import { fanvueConfigured, fanvueHealth } from "@/lib/fanvue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connectivity + auth probe for the Fanvue API integration — used by /fanvue UI
// to show whether the publish arm is armed before the user tries a real publish.
export async function GET() {
  if (!fanvueConfigured()) {
    return NextResponse.json({ configured: false, ok: false, detail: "FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET chýbajú vo Vercel env (Fanvue Builder area)" });
  }
  const h = await fanvueHealth();
  return NextResponse.json({ configured: true, ...h });
}

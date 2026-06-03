import { NextResponse } from "next/server";
import { reconcileFailedSlots } from "@/lib/dailyBatch";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  try {
    const result = await reconcileFailedSlots();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[reconcile]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

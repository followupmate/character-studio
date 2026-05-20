import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { post_id } = await req.json();

    const { error } = await supabase
      .from("chs_posts")
      .delete()
      .eq("id", post_id)
      .eq("status", "scheduled");

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cancel]", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

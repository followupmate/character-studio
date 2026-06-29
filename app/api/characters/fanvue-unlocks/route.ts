import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Update a Fanvue unlock DRAFT's status (draft → ready → archived) or edit copy fields.
// This only touches our DB (chs_fanvue_unlocks). It NEVER publishes to Fanvue or calls the Fanvue MCP.
const ALLOWED_STATUS = ["draft", "ready", "posted", "archived"];
const EDITABLE = ["series_name", "title", "teaser_text", "sales_copy", "suggested_price", "intensity", "ig_cta", "fanvue_prompt"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      if (!ALLOWED_STATUS.includes(body.status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
      update.status = body.status;
    }
    for (const k of EDITABLE) if (k in body) update[k] = body[k];
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

    const { error } = await supabase.from("chs_fanvue_unlocks").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

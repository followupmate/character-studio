import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveArc, maybeAutoPlanArc, type Arc } from "@/lib/arcPlanner";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const characterId = url.searchParams.get("character_id");

    if (!characterId) {
      return NextResponse.json({ error: "Missing character_id" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Fetch active arc
    const activeArc = await getActiveArc(characterId, today);

    // Fetch all planned/active/done arcs
    const { data: allArcs, error: arcError } = await supabase
      .from("chs_arcs")
      .select("*")
      .eq("character_id", characterId)
      .in("status", ["planned", "active", "done"])
      .order("start_date", { ascending: false })
      .limit(10);

    if (arcError) throw arcError;

    return NextResponse.json({
      activeArc: activeArc || null,
      arcs: allArcs || [],
    });
  } catch (error) {
    console.error("[arcs] GET error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { character_id: characterId, action, arc_id: arcId } = body;

    if (!characterId) {
      return NextResponse.json({ error: "Missing character_id" }, { status: 400 });
    }

    if (action === "plan") {
      // Generate and insert next arc
      const today = new Date().toISOString().split("T")[0];
      const arc = await maybeAutoPlanArc(characterId, today);

      return NextResponse.json({
        success: true,
        message: arc ? "Arc planned successfully" : "Arc already exists for this period",
        arc,
      });
    }

    if (action === "replan") {
      if (!arcId) throw new Error("arc_id required for replan");

      // Delete the planned arc and generate a new one
      const { error: delError } = await supabase
        .from("chs_arcs")
        .delete()
        .eq("id", arcId)
        .eq("status", "planned");

      if (delError) throw delError;

      const today = new Date().toISOString().split("T")[0];
      const arc = await maybeAutoPlanArc(characterId, today);

      return NextResponse.json({
        success: true,
        message: "Arc replanned successfully",
        arc,
      });
    }

    if (action === "cancel") {
      if (!arcId) throw new Error("arc_id required for cancel");

      const { error: updateError } = await supabase
        .from("chs_arcs")
        .update({ status: "cancelled" })
        .eq("id", arcId);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: "Arc cancelled",
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    console.error("[arcs] POST error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

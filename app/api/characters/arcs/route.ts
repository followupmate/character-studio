import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveArc, maybeAutoPlanArc } from "@/lib/arcPlanner";
import { cronAuthorized } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Auth: same convention as generate-media — CRON_SECRET for server-to-server (fail-closed via
// cronAuthorized), browser requests from the app UI allowed without a secret (see M1-3 in
// docs/AUDIT for the deferred Origin-bypass closure once a UI session/password exists).
function unauthorized(req: Request): NextResponse | null {
  const origin = req.headers.get("origin") ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const isBrowserRequest = origin.includes("vercel.app") || origin.includes("localhost") || origin === appUrl;
  if (!isBrowserRequest && !cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

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
  const deny = unauthorized(req);
  if (deny) return deny;
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

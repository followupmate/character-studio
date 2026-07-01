import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Wizard draft persistence — the /create wizard keeps its working copy in
// localStorage (unchanged) and mirrors it here so a draft survives closing
// the browser and can be resumed from any step on any device.

export async function GET() {
  const { data, error } = await supabase
    .from("chs_wizard_drafts")
    .select("id, name, step, updated_at")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const { id, dna, step } = await req.json() as {
      id?: string;
      dna: Record<string, unknown> & { name?: string };
      step?: string;
    };
    if (!dna) return NextResponse.json({ error: "dna required" }, { status: 400 });

    const row = {
      name: (dna.name as string | undefined) ?? null,
      step: step ?? "dna",
      dna,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { data, error } = await supabase
        .from("chs_wizard_drafts")
        .update(row)
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data) return NextResponse.json({ id: data.id });
      // Draft row vanished (deleted elsewhere) — fall through and create a new one.
    }

    const { data, error } = await supabase
      .from("chs_wizard_drafts")
      .insert(row)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json() as { id?: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await supabase.from("chs_wizard_drafts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

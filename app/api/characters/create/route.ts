import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CharacterDNA } from "@/lib/archetypes";

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let suffix = 2;
  while (true) {
    const { data } = await supabase
      .from("chs_characters")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${suffix++}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dna: CharacterDNA = body.dna;
    const postingTime: string = body.posting_time ?? "10:00";

    if (!dna?.name) {
      return NextResponse.json({ error: "Missing character name" }, { status: 400 });
    }

    const baseSlug = toSlug(dna.name);
    const slug = await uniqueSlug(baseSlug);

    const visualBrief = [
      dna.visual.ethnicityLook,
      dna.visual.hair,
      dna.visual.skinTone,
      dna.visual.faceStructure,
      dna.visual.bodyType,
      dna.visual.fashionStyle,
      dna.visual.colorPalette.join(", "),
      dna.visual.accessories.join(", "),
    ].filter(Boolean).join(". ");

    const backstory = [dna.identity.origin, dna.personality.worldview]
      .filter(Boolean)
      .join(" — ");

    const platforms = dna.content.platforms
      .map((p) => p.toLowerCase().replace("/", "").replace("x", "x").trim())
      .filter((p) => ["instagram", "tiktok", "youtube", "x"].includes(p));

    const { data, error } = await supabase
      .from("chs_characters")
      .insert({
        name: dna.name,
        slug,
        soul_id: dna.soul_id ?? null,
        visual_brief: visualBrief,
        backstory,
        personality: dna.personality,
        platforms,
        posting_time: postingTime,
        is_active: true,
      })
      .select("id, name, slug")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, character: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

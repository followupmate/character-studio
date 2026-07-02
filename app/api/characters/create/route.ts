import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CharacterDNA } from "@/lib/archetypes";
import { mapPlatforms } from "@/lib/platforms";

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

// Media-engine config collected in the launch step. Without these the character
// exists but can't auto-generate: /today gates generation on lora_model_id and
// the Google engine needs character_sheet_url as its identity reference.
interface MediaConfig {
  character_sheet_url?: string;
  lora_model_id?: string;
  lora_trigger_word?: string;
  reference_image_urls?: string[];
  photo_url?: string;
}



export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dna: CharacterDNA = body.dna;
    const postingTime: string = body.posting_time ?? "10:00";
    const media: MediaConfig = body.media ?? {};

    if (!dna?.name?.trim()) {
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

    // Prefer the AI-generated lore backstory (much richer) over the raw origin field.
    const backstory = [dna.lore?.backstory || dna.identity.origin, dna.personality.worldview]
      .filter(Boolean)
      .join(" — ");

    const platforms = mapPlatforms(dna.content.platforms);

    const cleanUrl = (u?: string) => (u?.trim() ? u.trim() : null);
    const refUrls = (media.reference_image_urls ?? [])
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//.test(u));

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
        character_sheet_url:  cleanUrl(media.character_sheet_url),
        lora_model_id:        cleanUrl(media.lora_model_id),
        lora_trigger_word:    cleanUrl(media.lora_trigger_word),
        reference_image_urls: refUrls.length > 0 ? refUrls : null,
        photo_url:            cleanUrl(media.photo_url) ?? cleanUrl(media.character_sheet_url),
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

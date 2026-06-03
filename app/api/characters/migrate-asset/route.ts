import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-time migration: download an external asset URL and re-upload to Supabase Storage.
// Keeps the character_sheet_url (and optionally reference_image_urls) alive after
// third-party CDN subscriptions expire.
//
// Usage:
//   POST /api/characters/migrate-asset
//   { "character_id": "...", "field": "character_sheet_url" }
//
// Returns: { success: true, newUrl: "https://...supabase.co/..." }

export async function POST(req: Request) {
  try {
    const { character_id, field = "character_sheet_url" } = await req.json() as {
      character_id: string;
      field?: "character_sheet_url" | "reference_image_urls";
    };

    if (!character_id) {
      return NextResponse.json({ error: "character_id required" }, { status: 400 });
    }

    const { data: character, error: charErr } = await supabase
      .from("chs_characters")
      .select("id, name, character_sheet_url, reference_image_urls")
      .eq("id", character_id)
      .single();

    if (charErr || !character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    if (field === "character_sheet_url") {
      const url = (character as Record<string, unknown>).character_sheet_url as string | null;
      if (!url) {
        return NextResponse.json({ error: "character_sheet_url is empty" }, { status: 400 });
      }

      // Already on Supabase — skip
      if (url.includes("supabase.co")) {
        return NextResponse.json({ success: true, newUrl: url, note: "already on Supabase" });
      }

      const newUrl = await downloadAndStore(url, `characters/${character_id}-sheet`);

      await supabase
        .from("chs_characters")
        .update({ character_sheet_url: newUrl })
        .eq("id", character_id);

      return NextResponse.json({ success: true, newUrl });
    }

    if (field === "reference_image_urls") {
      const urls = (character.reference_image_urls as string[] | null) ?? [];
      if (urls.length === 0) {
        return NextResponse.json({ error: "reference_image_urls is empty" }, { status: 400 });
      }

      const newUrls: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        if (u.includes("supabase.co")) {
          newUrls.push(u);
          continue;
        }
        const newUrl = await downloadAndStore(u, `characters/${character_id}-ref-${i}`);
        newUrls.push(newUrl);
      }

      await supabase
        .from("chs_characters")
        .update({ reference_image_urls: newUrls })
        .eq("id", character_id);

      return NextResponse.json({ success: true, newUrls });
    }

    return NextResponse.json({ error: "Unknown field" }, { status: 400 });
  } catch (err) {
    console.error("[migrate-asset]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function downloadAndStore(sourceUrl: string, basePath: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status} ${sourceUrl.slice(0, 80)}`);

  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("webp") ? "webp"
    : contentType.includes("png") ? "png"
    : contentType.includes("gif") ? "gif"
    : "jpg";

  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `${basePath}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("character-media")
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

  const { data: publicData } = supabase.storage
    .from("character-media")
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

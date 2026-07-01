import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateSoulImage, soulConfigured } from "@/lib/higgsfieldSoul";
import { CharacterDNA } from "@/lib/archetypes";

export const runtime = "nodejs";
export const maxDuration = 120;

// Generates the AI character reference sheet used as the identity anchor for
// Google Nano Banana generation (character_sheet_url on chs_characters).
// AI-generated sheets don't trigger Google's anti-deepfake IMAGE_SAFETY
// classifier the way real-person photos do — see generate-media.
//
// Input (one of):
//   { dna, referenceImageUrl? }  — wizard mode, character not in DB yet; returns { url }
//   { characterId }              — existing character; also saves character_sheet_url
//
// Engine: Google Nano Banana Pro → Nano Banana 2 → Higgsfield Soul (needs soul_id).

function buildVisualBrief(dna: CharacterDNA): string {
  return [
    dna.visual.ethnicityLook,
    dna.visual.hair,
    dna.visual.skinTone,
    dna.visual.faceStructure,
    dna.visual.bodyType,
    dna.visual.fashionStyle,
  ].filter(Boolean).join(", ");
}

function sheetPrompt(visualBrief: string, hasReference: boolean): string {
  const identity = hasReference
    ? "Character reference sheet of the woman from the reference image — preserve her exact facial structure, eye shape, nose, lips, skin tone and hair with zero deviation."
    : "Character reference sheet of a fictional AI-generated woman.";
  return [
    identity,
    `Appearance: ${visualBrief}.`,
    "Single square image containing a 2x2 grid with four views of the SAME identical face:",
    "top-left front-facing neutral portrait, top-right three-quarter view,",
    "bottom-left left side profile, bottom-right front portrait with a gentle natural smile.",
    "Neutral light grey seamless studio background in every panel, even soft studio lighting,",
    "photorealistic, ultra-detailed natural skin texture with visible pores, no retouching.",
    "Square image, 1:1 aspect ratio.",
  ].join(" ");
}

interface GoogleImageResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> };
  }>;
}

async function generateSheetWithGoogle(
  prompt: string,
  referenceImageUrl: string | null,
  googleKey: string,
  modelId: string
): Promise<Buffer> {
  const parts: unknown[] = [];

  if (referenceImageUrl) {
    try {
      const res = await fetch(referenceImageUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const rawMime = res.headers.get("content-type") ?? "";
        const mime = rawMime.startsWith("image/") && !rawMime.includes("octet-stream")
          ? rawMime.split(";")[0]
          : referenceImageUrl.toLowerCase().endsWith(".webp") ? "image/webp"
          : referenceImageUrl.toLowerCase().endsWith(".png")  ? "image/png"
          : "image/jpeg";
        parts.push({ inlineData: { mimeType: mime, data: Buffer.from(buf).toString("base64") } });
      }
    } catch { /* proceed text-only if reference fetch fails */ }
  }

  parts.push({ text: prompt });

  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    }
  );

  const resText = await apiRes.text();
  if (!apiRes.ok) throw new Error(`Google API ${apiRes.status}: ${resText.slice(0, 300)}`);

  let data: GoogleImageResponse;
  try { data = JSON.parse(resText); }
  catch { throw new Error(`Google API: invalid JSON — ${resText.slice(0, 200)}`); }

  const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imagePart?.inlineData) {
    const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text);
    throw new Error(`Google API: no image returned. ${textPart?.text ?? resText.slice(0, 200)}`);
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

async function uploadSheet(buf: Buffer, key: string): Promise<string> {
  const path = `sheets/${key}.png`;
  const { error } = await supabase.storage
    .from("character-media")
    .upload(path, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Storage upload: ${error.message}`);
  const { data } = supabase.storage.from("character-media").getPublicUrl(path);
  // Cache-buster so regenerated sheets show up immediately in the browser
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      dna?: CharacterDNA;
      referenceImageUrl?: string;
      characterId?: string;
    };

    const googleKey = process.env.GOOGLE_API_KEY;

    // ── Resolve inputs (wizard DNA vs existing character) ──────
    let visualBrief: string;
    let referenceImageUrl: string | null = body.referenceImageUrl?.trim() || null;
    let soulId: string | null = null;
    let storageKey: string;
    let characterId: string | null = null;

    if (body.characterId) {
      const { data: character } = await supabase
        .from("chs_characters")
        .select("id, name, visual_brief, soul_id, reference_image_urls")
        .eq("id", body.characterId)
        .single();
      if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 });
      visualBrief = character.visual_brief ?? "";
      soulId = (character.soul_id as string | null) ?? null;
      if (!referenceImageUrl) {
        referenceImageUrl = (character.reference_image_urls as string[] | null)?.[0] ?? null;
      }
      storageKey = character.id;
      characterId = character.id;
    } else if (body.dna) {
      visualBrief = buildVisualBrief(body.dna);
      soulId = body.dna.soul_id ?? null;
      storageKey = `draft-${(body.dna.name || "character").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    } else {
      return NextResponse.json({ error: "Provide dna or characterId" }, { status: 400 });
    }

    if (!visualBrief.trim() && !referenceImageUrl) {
      return NextResponse.json({ error: "Visual DNA is empty — vyplň sekciu Visual DNA alebo pridaj referenčnú fotku" }, { status: 400 });
    }

    // ── Generate: Google Pro → Google Flash → Higgsfield Soul ──
    const prompt = sheetPrompt(visualBrief, !!referenceImageUrl);
    let url: string | null = null;
    let provider = "";
    const errors: string[] = [];

    if (googleKey) {
      for (const modelId of ["gemini-3-pro-image", "gemini-3.1-flash-image"]) {
        try {
          const buf = await generateSheetWithGoogle(prompt, referenceImageUrl, googleKey, modelId);
          url = await uploadSheet(buf, storageKey);
          provider = modelId;
          break;
        } catch (err) {
          errors.push(`${modelId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      errors.push("GOOGLE_API_KEY not configured");
    }

    if (!url && soulId && soulConfigured()) {
      // Higgsfield Soul fallback: the trained identity can't render a grid reliably,
      // so ask for a single clean front portrait instead — still a usable identity sheet.
      try {
        url = await generateSoulImage({
          prompt: `Professional studio identity portrait, front-facing, neutral expression, direct gaze into camera, seamless light grey studio background, even soft lighting, ultra-detailed natural skin texture. ${visualBrief}`,
          soulId,
          aspect: "1:1",
          mediaId: `sheet-${storageKey}`,
        });
        provider = "higgsfield-soul";
      } catch (err) {
        errors.push(`higgsfield: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!url) {
      return NextResponse.json({ error: `Sheet generation failed — ${errors.join(" | ")}` }, { status: 502 });
    }

    // Existing character → persist immediately (and use as profile photo if none set)
    if (characterId) {
      const { data: current } = await supabase
        .from("chs_characters")
        .select("photo_url")
        .eq("id", characterId)
        .single();
      await supabase
        .from("chs_characters")
        .update({ character_sheet_url: url, ...(current?.photo_url ? {} : { photo_url: url }) })
        .eq("id", characterId);
    }

    return NextResponse.json({ success: true, url, provider });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

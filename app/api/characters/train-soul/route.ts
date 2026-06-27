import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { HiggsfieldClient, InputImageType } from "@higgsfield/client";

export const runtime = "nodejs";
export const maxDuration = 120;

// TEMPORARY one-off route to train a Cloud-API-scoped Soul for Vivienne.
// The consumer-app soul is invisible to the Cloud API (separate scope), so we retrain via the Cloud API
// using the original training images. Flow (driven by a local script):
//   POST {action:"upload", idx, b64}        -> upload one training image to Supabase, return public URL
//   POST {action:"create", name, image_urls}-> createSoulId on the Cloud API, return {id,status}
//   GET  ?status                             -> list Cloud souls + their status
// Delete this route once the Cloud soul_id is trained and saved.

function client() {
  const credentials = process.env.HIGGSFIELD_API_KEY!;
  const colon = credentials.indexOf(":");
  const apiKey = credentials.slice(0, colon);
  const apiSecret = credentials.slice(colon + 1);
  return new HiggsfieldClient({ apiKey, apiSecret, headers: { Authorization: `Key ${apiKey}:${apiSecret}` } });
}

export async function GET() {
  try {
    const list = await client().listSoulIds(1, 50);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === "upload") {
      const buf = Buffer.from(body.b64 as string, "base64");
      const obj = `souls/training/viv_${String(body.idx).padStart(2, "0")}.jpg`;
      const { error } = await supabase.storage
        .from("character-media")
        .upload(obj, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(`upload failed: ${error.message}`);
      const { data: pub } = supabase.storage.from("character-media").getPublicUrl(obj);
      return NextResponse.json({ url: pub.publicUrl });
    }

    if (body.action === "create") {
      const image_urls = (body.image_urls as string[]).map((u) => ({ type: InputImageType.IMAGE_URL, image_url: u }));
      const soul = await client().createSoulId(
        { name: (body.name as string) || "Vivienne", input_images: image_urls },
        false // don't block — poll separately via GET
      );
      return NextResponse.json({ id: (soul as { id: string }).id, status: (soul as { status: string }).status });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

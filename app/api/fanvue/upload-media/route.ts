import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Item 9 — real file upload for Fanvue paid-continuation shots (JPG/PNG/WebP), distinct from the
// plain URL-attach fallback (app/api/characters/fanvue-unlocks/route.ts's shotPatch.mediaUrl).
// Stores into the same "character-media" Supabase Storage bucket lib/higgsfieldSoul.ts already
// uses for AI-generated shots, so manually-uploaded and generated media live side by side.
// Returns a public URL only — attaching it to a specific shot happens via the existing
// shotPatch.mediaUrl PATCH (see FanvueClient.tsx's uploadShotFile), never automatically here.

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const EXT_BY_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const unlockId = form.get("unlockId");
    const step = form.get("step");

    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (typeof unlockId !== "string" || !unlockId) return NextResponse.json({ error: "unlockId required" }, { status: 400 });
    if (typeof step !== "string" || !step) return NextResponse.json({ error: "step required" }, { status: 400 });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Nepodporovaný typ súboru "${file.type}" — povolené sú len JPG/PNG/WebP` }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `Súbor je príliš veľký (${(file.size / 1024 / 1024).toFixed(1)} MB, max 15 MB)` }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = EXT_BY_TYPE[file.type];
    const path = `fanvue/${unlockId}/${step}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("character-media").upload(path, buf, { contentType: file.type, upsert: true });
    if (error) return NextResponse.json({ error: `Storage upload zlyhal: ${error.message}` }, { status: 500 });

    const { data: pub } = supabase.storage.from("character-media").getPublicUrl(path);
    return NextResponse.json({ success: true, url: pub.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

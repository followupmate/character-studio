import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

// Ensure the chs-media bucket exists (idempotent)
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === "chs-media")) {
    await supabase.storage.createBucket("chs-media", {
      public: true,
      fileSizeLimit: 524288000, // 500 MB
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"],
    });
  }
}

export async function POST(req: Request) {
  try {
    const files: Array<{ path: string; contentType: string }> = await req.json();

    await ensureBucket();

    const results = await Promise.all(
      files.map(async ({ path, contentType }) => {
        const { data, error } = await supabase.storage
          .from("chs-media")
          .createSignedUploadUrl(path);
        if (error) throw error;
        return { path, signedUrl: data.signedUrl, token: data.token };
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("[sign-upload]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

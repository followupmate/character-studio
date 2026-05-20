import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(`Missing env vars: SUPABASE_URL=${!!url} SUPABASE_SERVICE_KEY=${!!key}`);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureBucket(supabase: ReturnType<typeof getAdminClient>) {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);
  if (!buckets?.find((b) => b.name === "chs-media")) {
    const { error: createErr } = await supabase.storage.createBucket("chs-media", {
      public: true,
      fileSizeLimit: 524288000,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"],
    });
    if (createErr) throw new Error(`createBucket failed: ${createErr.message}`);
  }
}

export async function POST(req: Request) {
  try {
    const files: Array<{ path: string; contentType: string }> = await req.json();

    const supabase = getAdminClient();
    await ensureBucket(supabase);

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

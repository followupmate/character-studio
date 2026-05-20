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

export async function POST(req: Request) {
  try {
    const files: Array<{ path: string; contentType: string }> = await req.json();

    const supabase = getAdminClient();

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

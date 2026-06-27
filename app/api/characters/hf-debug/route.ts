import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

// TEMPORARY debug route: probe Soul V2 model_ids, test generation params (2K), retrain Soul.
// Delete once locked in.

const BASE = "https://platform.higgsfield.ai";
function auth() {
  return `Key ${process.env.HIGGSFIELD_API_KEY!}`;
}

async function genPoll(model: string, params: Record<string, unknown>) {
  const r = await fetch(`${BASE}/${model}`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let job = (await r.json().catch(() => ({}))) as {
    status?: string; status_url?: string; images?: Array<{ url?: string }>; detail?: unknown;
  };
  if (!r.ok) return { submit_status: r.status, body: job };
  for (let i = 0; i < 45 && !["completed", "failed", "nsfw"].includes(job.status ?? ""); i++) {
    if (!job.status_url) break;
    await new Promise((res) => setTimeout(res, 2500));
    job = await (await fetch(job.status_url, { headers: { Authorization: auth() } })).json();
  }
  return { status: job.status, url: job.images?.[0]?.url ?? null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Probe which model_ids exist (empty body → 404 missing, 4xx-validation = exists).
    if (body.action === "probe") {
      const out: Record<string, unknown> = {};
      for (const m of body.models as string[]) {
        const r = await fetch(`${BASE}/${m}`, {
          method: "POST",
          headers: { Authorization: auth(), "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        out[m] = { status: r.status, body: (await r.text()).slice(0, 200) };
      }
      return NextResponse.json(out);
    }

    if (body.action === "upload") {
      const buf = Buffer.from(body.b64 as string, "base64");
      const obj = `souls/training/viv_${String(body.idx).padStart(2, "0")}.jpg`;
      const { error } = await supabase.storage.from("character-media").upload(obj, buf, { contentType: "image/jpeg", upsert: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const { data: pub } = supabase.storage.from("character-media").getPublicUrl(obj);
      return NextResponse.json({ url: pub.publicUrl });
    }

    if (body.action === "gen") {
      return NextResponse.json(await genPoll(body.model as string, body.params as Record<string, unknown>));
    }

    if (body.action === "createsoul") {
      const r = await fetch(`${BASE}/v1/custom-references`, {
        method: "POST",
        headers: { Authorization: auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: body.name || "Vivienne",
          input_images: (body.image_urls as string[]).map((u) => ({ type: "image_url", image_url: u })),
        }),
      });
      return NextResponse.json({ status: r.status, body: await r.json().catch(() => ({})) });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// GET ?souls — list Cloud souls + status.
export async function GET() {
  const r = await fetch(`${BASE}/v1/custom-references?page=1&page_size=50`, { headers: { Authorization: auth() } });
  return NextResponse.json({ status: r.status, body: await r.json().catch(() => ({})) });
}

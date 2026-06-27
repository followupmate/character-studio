import { NextResponse } from "next/server";
import { HiggsfieldClient } from "@higgsfield/client";

export const runtime = "nodejs";
export const maxDuration = 120;

// TEMPORARY debug route to probe Cloud API models + test Soul model_ids/params for realism.
// Delete once the best Soul model + params are locked in.

function client() {
  const c = process.env.HIGGSFIELD_API_KEY!;
  const i = c.indexOf(":");
  const apiKey = c.slice(0, i);
  const apiSecret = c.slice(i + 1);
  return new HiggsfieldClient({ apiKey, apiSecret, headers: { Authorization: `Key ${apiKey}:${apiSecret}` } });
}

function extractUrl(j: unknown): string | null {
  const o = j as { jobs?: Array<{ results?: { raw?: { url?: string } } }>; images?: Array<{ url?: string }> };
  return o?.jobs?.[0]?.results?.raw?.url ?? o?.images?.[0]?.url ?? null;
}

// GET ?models — probe candidate model-catalog endpoints with the Cloud key.
export async function GET() {
  const c = process.env.HIGGSFIELD_API_KEY!;
  const i = c.indexOf(":");
  const auth = `Key ${c.slice(0, i)}:${c.slice(i + 1)}`;
  const base = "https://platform.higgsfield.ai";
  const candidates = ["/v1/models", "/models", "/v1/job-types", "/v1/job_sets/job_set_types", "/v1/job_set_types", "/v1/text2image"];
  const out: Record<string, unknown> = {};
  for (const path of candidates) {
    try {
      const r = await fetch(base + path, { headers: { Authorization: auth, "hf-api-key": c.slice(0, i), "hf-secret": c.slice(i + 1) } });
      const t = await r.text();
      out[path] = { status: r.status, body: t.slice(0, 1500) };
    } catch (e) {
      out[path] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json(out);
}

// POST { endpoint, params } — raw generate, returns the source image URL (not saved to media).
export async function POST(req: Request) {
  try {
    const { endpoint, params } = (await req.json()) as { endpoint: string; params: Record<string, unknown> };
    const jobSet = await client().generate(endpoint, params, { withPolling: true });
    return NextResponse.json({ status: (jobSet as { status?: string }).status ?? "ok", url: extractUrl(jobSet) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

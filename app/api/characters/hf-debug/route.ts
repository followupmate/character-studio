import { NextResponse } from "next/server";
import { HiggsfieldClient } from "@higgsfield/client";

export const runtime = "nodejs";
export const maxDuration = 120;

// TEMPORARY debug route to test Soul model_ids/params for realism (v1 params-wrapped vs v2 direct body).
// Delete once the best Soul model + params are locked in.

const BASE = "https://platform.higgsfield.ai";

function creds() {
  const c = process.env.HIGGSFIELD_API_KEY!;
  const i = c.indexOf(":");
  return { key: c.slice(0, i), secret: c.slice(i + 1), full: `${c.slice(0, i)}:${c.slice(i + 1)}` };
}

function v1client() {
  const { key, secret } = creds();
  return new HiggsfieldClient({ apiKey: key, apiSecret: secret, headers: { Authorization: `Key ${key}:${secret}` } });
}

function urlFrom(j: unknown): string | null {
  const o = j as {
    jobs?: Array<{ results?: { raw?: { url?: string } } }>;
    images?: Array<{ url?: string }>;
  };
  return o?.jobs?.[0]?.results?.raw?.url ?? o?.images?.[0]?.url ?? null;
}

// POST { mode:"v1"|"v2", endpoint, params }
export async function POST(req: Request) {
  try {
    const { mode = "v2", endpoint, params } = (await req.json()) as {
      mode?: "v1" | "v2";
      endpoint: string;
      params: Record<string, unknown>;
    };

    if (mode === "v1") {
      const jobSet = await v1client().generate(endpoint, params, { withPolling: true });
      return NextResponse.json({ status: (jobSet as { status?: string }).status ?? "ok", url: urlFrom(jobSet) });
    }

    // v2 style: direct body to /{endpoint}, Authorization: Key, then poll status_url.
    const { full } = creds();
    const headers = { Authorization: `Key ${full}`, "Content-Type": "application/json" };
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const r = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(params) });
    const first = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ submit_status: r.status, body: first }, { status: 200 });

    let cur = first as { status?: string; status_url?: string; images?: Array<{ url?: string }> };
    for (let i = 0; i < 40 && cur.status !== "completed" && cur.status !== "failed" && cur.status !== "nsfw"; i++) {
      if (!cur.status_url) break;
      await new Promise((res) => setTimeout(res, 2500));
      const pr = await fetch(cur.status_url, { headers: { Authorization: `Key ${full}` } });
      cur = await pr.json();
    }
    return NextResponse.json({ status: cur.status, url: cur.images?.[0]?.url ?? null, raw: cur });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

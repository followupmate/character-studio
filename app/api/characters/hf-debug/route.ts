import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// TEMPORARY debug: probe Soul V2 model_ids/params + test generation. Delete once locked in.
const BASE = "https://platform.higgsfield.ai";
function auth() { return `Key ${process.env.HIGGSFIELD_API_KEY!}`; }

async function genPoll(model: string, params: Record<string, unknown>) {
  const r = await fetch(`${BASE}/${model}`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let job = (await r.json().catch(() => ({}))) as { status?: string; status_url?: string; images?: Array<{ url?: string }> };
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
    if (body.action === "probe") {
      const out: Record<string, unknown> = {};
      for (const m of body.models as string[]) {
        const r = await fetch(`${BASE}/${m}`, {
          method: "POST",
          headers: { Authorization: auth(), "Content-Type": "application/json" },
          body: JSON.stringify(body.body ?? {}),
        });
        out[m] = { status: r.status, body: (await r.text()).slice(0, 280) };
      }
      return NextResponse.json(out);
    }
    if (body.action === "gen") {
      return NextResponse.json(await genPoll(body.model as string, body.params as Record<string, unknown>));
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

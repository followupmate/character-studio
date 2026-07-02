import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  fanvueConfigured, uploadImageFromUrl, createFanvuePost, sendFanvueMassMessage,
} from "@/lib/fanvue";

export const runtime = "nodejs";
export const maxDuration = 300;

// FANVUE AUTOPILOT step 2 — publish an approved unlock draft to Fanvue.
// Uploads the generated set to the Fanvue vault, then either creates a (PPV) post
// or sends a PPV mass message to subscribers. Runs ONLY on explicit user action
// from /fanvue — there is no cron path to this route by design.

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      unlockId?: string;
      mode?: "post" | "mass_message";
      priceEur?: number;              // 0 / undefined = free (subscribers-only post)
      audience?: "subscribers" | "followers-and-subscribers";
    };
    const { unlockId, mode = "post" } = body;
    if (!unlockId) return NextResponse.json({ error: "unlockId required" }, { status: 400 });
    if (!fanvueConfigured()) {
      return NextResponse.json({ error: "FANVUE_CLIENT_ID / FANVUE_CLIENT_SECRET nie sú nastavené — vytvor app vo Fanvue Builder a autorizuj cez /api/auth/fanvue" }, { status: 500 });
    }

    const { data: unlock } = await supabase
      .from("chs_fanvue_unlocks")
      .select("id, title, series_name, teaser_text, sales_copy, suggested_price, unlock_type, media_urls, fanvue_media_uuids, status")
      .eq("id", unlockId)
      .single();
    if (!unlock) return NextResponse.json({ error: "Unlock draft not found" }, { status: 404 });

    const mediaUrls = (unlock.media_urls as string[] | null) ?? [];
    if (mediaUrls.length === 0) {
      return NextResponse.json({ error: "Draft nemá vygenerovaný set — najprv 'Vygeneruj set'" }, { status: 422 });
    }

    const fail = async (msg: string, status = 502) => {
      await supabase.from("chs_fanvue_unlocks").update({ publish_error: msg.slice(0, 500) }).eq("id", unlockId);
      return NextResponse.json({ error: msg }, { status });
    };

    // ── Upload set to Fanvue vault (reuse uuids if a previous publish attempt got this far) ──
    let mediaUuids = (unlock.fanvue_media_uuids as string[] | null) ?? [];
    if (mediaUuids.length !== mediaUrls.length) {
      mediaUuids = [];
      for (let i = 0; i < mediaUrls.length; i++) {
        try {
          const uuid = await uploadImageFromUrl(mediaUrls[i], `${unlock.series_name} ${i + 1}`);
          mediaUuids.push(uuid);
        } catch (err) {
          return await fail(`Upload ${i + 1}/${mediaUrls.length} zlyhal — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await supabase.from("chs_fanvue_unlocks").update({ fanvue_media_uuids: mediaUuids }).eq("id", unlockId);
    }

    // ── Price & copy ────────────────────────────────────────────
    const priceEur = body.priceEur ?? Number(unlock.suggested_price ?? 0);
    const priceCents = priceEur > 0 ? Math.max(300, Math.round(priceEur * 100)) : undefined;
    const text = (unlock.sales_copy || unlock.teaser_text || unlock.title || "").toString();

    // ── Publish ─────────────────────────────────────────────────
    let result: Record<string, unknown>;
    try {
      if (mode === "mass_message") {
        result = await sendFanvueMassMessage({ text, mediaUuids, priceCents });
      } else {
        // Paid post → open audience so followers can buy the unlock; free post → subscribers perk.
        const audience = body.audience ?? (priceCents ? "followers-and-subscribers" : "subscribers");
        result = await createFanvuePost({ text, mediaUuids, audience, priceCents });
      }
    } catch (err) {
      return await fail(err instanceof Error ? err.message : String(err));
    }

    await supabase
      .from("chs_fanvue_unlocks")
      .update({ status: "posted", published_at: new Date().toISOString(), publish_error: null })
      .eq("id", unlockId);

    return NextResponse.json({ success: true, mode, priceCents: priceCents ?? 0, mediaCount: mediaUuids.length, result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

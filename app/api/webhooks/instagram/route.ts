import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireEnv } from "@/lib/env";
import {
  buildInstagramEventKey,
  getInstagramEventType,
  verifyInstagramSignature,
} from "@/lib/instagramWebhook";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    verifyToken === requireEnv("IG_WEBHOOK_VERIFY_TOKEN") &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ success: false, error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const appSecret = requireEnv("IG_APP_SECRET");

  if (!verifyInstagramSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ success: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventKey = buildInstagramEventKey(rawBody);
  const eventType = getInstagramEventType(payload);

  const { error } = await supabase.from("chs_ig_webhook_events").insert({
    event_key: eventKey,
    event_type: eventType,
    payload,
    status: "pending",
  });

  if (error && error.code !== "23505") {
    console.error("[instagram-webhook] storage failed", error.message);
    return NextResponse.json({ success: false, error: "Webhook storage failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, duplicate: error?.code === "23505" });
}

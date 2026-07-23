import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireEnv } from "@/lib/env";
import {
  buildInstagramEventKey,
  getInstagramEventType,
  verifyInstagramSignature,
} from "@/lib/instagramWebhook";
import {
  markInstagramWebhookFailed,
  processStoredInstagramWebhook,
} from "@/lib/instagramEventStore";

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
  const { data: storedEvent, error } = await supabase
    .from("chs_ig_webhook_events")
    .insert({
      event_key: eventKey,
      event_type: eventType,
      payload,
      status: "pending",
    })
    .select("id")
    .single();

  let webhookEventId = storedEvent?.id as string | undefined;
  let duplicate = false;

  if (error?.code === "23505") {
    duplicate = true;
    const { data: existingEvent, error: lookupError } = await supabase
      .from("chs_ig_webhook_events")
      .select("id,status")
      .eq("event_key", eventKey)
      .single();

    if (lookupError || !existingEvent?.id) {
      console.error("[instagram-webhook] duplicate lookup failed", lookupError?.message ?? "missing event");
      return NextResponse.json({ success: false, error: "Webhook lookup failed" }, { status: 500 });
    }

    if (existingEvent.status === "processed" || existingEvent.status === "ignored") {
      return NextResponse.json({ success: true, duplicate: true, retried: false });
    }

    webhookEventId = existingEvent.id as string;
  } else if (error || !webhookEventId) {
    console.error("[instagram-webhook] storage failed", error?.message ?? "missing event id");
    return NextResponse.json({ success: false, error: "Webhook storage failed" }, { status: 500 });
  }

  try {
    const result = await processStoredInstagramWebhook(webhookEventId, payload);
    return NextResponse.json({ success: true, duplicate, retried: duplicate, ...result });
  } catch (processingError) {
    const message = processingError instanceof Error ? processingError.message : String(processingError);
    console.error("[instagram-webhook] processing failed", message);
    await markInstagramWebhookFailed(webhookEventId, message);
    return NextResponse.json({ success: false, error: "Webhook processing failed" }, { status: 500 });
  }
}

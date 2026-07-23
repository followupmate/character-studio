import { supabase } from "@/lib/supabase";
import { parseInstagramEvents } from "@/lib/instagramEventParser";
import { runInstagramAgent } from "@/lib/instagramAgent";

export type InstagramEventProcessingResult = {
  parsed: number;
  stored: number;
  duplicates: number;
  agentRuns: number;
};

export async function processStoredInstagramWebhook(
  webhookEventId: string,
  payload: unknown
): Promise<InstagramEventProcessingResult> {
  const events = parseInstagramEvents(payload);
  let stored = 0;
  let duplicates = 0;
  let agentRuns = 0;

  if (events.length === 0) {
    const { error } = await supabase
      .from("chs_ig_webhook_events")
      .update({
        status: "ignored",
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookEventId);

    if (error) throw new Error(`Unable to mark webhook ignored: ${error.message}`);
    return { parsed: 0, stored: 0, duplicates: 0, agentRuns: 0 };
  }

  for (const event of events) {
    const now = new Date().toISOString();
    const contactUpdate = {
      ig_scoped_user_id: event.contactId,
      username: event.kind === "comment" ? event.username : null,
      last_inbound_at: now,
      updated_at: now,
    };

    const { error: contactError } = await supabase
      .from("chs_ig_contacts")
      .upsert(contactUpdate, { onConflict: "ig_scoped_user_id" });

    if (contactError) throw new Error(`Unable to store Instagram contact: ${contactError.message}`);

    const messageRow = {
      platform_message_id: event.platformMessageId,
      contact_id: event.contactId,
      direction: "inbound",
      source_type: event.kind,
      text_content: event.text,
      media_id: event.kind === "comment" ? event.mediaId : null,
      comment_id: event.kind === "comment" ? event.platformMessageId : null,
      parent_comment_id: event.kind === "comment" ? event.parentCommentId : null,
      raw_payload: event.raw,
    };

    const { error: messageError } = await supabase.from("chs_ig_messages").insert(messageRow);
    if (messageError?.code === "23505") {
      duplicates += 1;
      continue;
    }
    if (messageError) throw new Error(`Unable to store Instagram message: ${messageError.message}`);
    stored += 1;

    await runInstagramAgent({
      webhookEventId,
      contactId: event.contactId,
      sourceType: event.kind,
      text: event.text,
    });

    if (process.env.IG_AGENT_ENABLED === "true" && event.text?.trim()) {
      agentRuns += 1;
    }
  }

  const { error: eventError } = await supabase
    .from("chs_ig_webhook_events")
    .update({
      status: "processed",
      attempts: 1,
      processed_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", webhookEventId);

  if (eventError) throw new Error(`Unable to mark webhook processed: ${eventError.message}`);

  return { parsed: events.length, stored, duplicates, agentRuns };
}

export async function markInstagramWebhookFailed(webhookEventId: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("chs_ig_webhook_events")
    .update({
      status: "failed",
      attempts: 1,
      error: errorMessage.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    .eq("id", webhookEventId);

  if (error) console.error("[instagram-webhook] unable to mark event failed", error.message);
}

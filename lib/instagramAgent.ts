import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { sendInstagramDirectMessage } from "@/lib/instagramMessaging";

const MODEL = process.env.IG_AGENT_MODEL || "claude-3-5-haiku-latest";

type AgentDecision = {
  intent: string;
  risk_level: "low" | "medium" | "high";
  should_reply: boolean;
  should_mention_fanvue: boolean;
  reply: string | null;
};

type RunInstagramAgentInput = {
  webhookEventId: string;
  contactId: string;
  sourceType: "dm" | "comment";
  text: string | null;
};

function isEnabled(): boolean {
  return process.env.IG_AGENT_ENABLED === "true";
}

function isDryRun(): boolean {
  return process.env.IG_AGENT_DRY_RUN !== "false";
}

function parseDecision(raw: string): AgentDecision {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const value = JSON.parse(cleaned) as Partial<AgentDecision>;

  return {
    intent: typeof value.intent === "string" ? value.intent.slice(0, 100) : "unknown",
    risk_level: value.risk_level === "medium" || value.risk_level === "high" ? value.risk_level : "low",
    should_reply: value.should_reply === true,
    should_mention_fanvue: value.should_mention_fanvue === true,
    reply: typeof value.reply === "string" && value.reply.trim() ? value.reply.trim().slice(0, 1000) : null,
  };
}

async function loadConversation(contactId: string): Promise<string> {
  const { data, error } = await supabase
    .from("chs_ig_messages")
    .select("direction,source_type,text_content,created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(`Unable to load Instagram conversation: ${error.message}`);

  return (data ?? [])
    .reverse()
    .map((message) => `${message.direction === "outbound" ? "Vivien" : "User"}: ${message.text_content ?? "[no text]"}`)
    .join("\n");
}

export async function runInstagramAgent(input: RunInstagramAgentInput): Promise<void> {
  if (!isEnabled() || !input.text?.trim()) return;

  const dryRun = isDryRun();
  let runId: string | null = null;

  try {
    const conversation = await loadConversation(input.contactId);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 350,
      temperature: 0.5,
      system: `You are Vivien's Instagram conversation assistant. Decide whether to reply to the latest inbound Instagram DM or comment and draft a concise natural reply in the user's language.

Rules:
- Be warm, playful and human, but never claim to be human or invent real-world actions.
- Do not send explicit sexual content, threats, harassment, medical, legal or financial advice.
- Ignore spam, scams, meaningless text and obvious bot messages.
- Mention Fanvue only when the user shows clear interest in exclusive content, asks where to see more, or the conversation naturally supports it. Never pressure the user and never include a URL.
- For public comments, keep the reply shorter and safer than for DMs.
- Return valid JSON only with keys: intent, risk_level, should_reply, should_mention_fanvue, reply.
- risk_level must be low, medium or high. reply must be null when should_reply is false.`,
      messages: [
        {
          role: "user",
          content: `Source: ${input.sourceType}\nConversation:\n${conversation || `User: ${input.text}`}\n\nClassify and draft the response.`,
        },
      ],
    });

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const decision = parseDecision(raw);

    const { data: run, error: runError } = await supabase
      .from("chs_ig_agent_runs")
      .insert({
        webhook_event_id: input.webhookEventId,
        contact_id: input.contactId,
        intent: decision.intent,
        risk_level: decision.risk_level,
        should_reply: decision.should_reply,
        should_mention_fanvue: decision.should_mention_fanvue,
        generated_reply: decision.reply,
        sent: false,
        dry_run: dryRun,
        model: MODEL,
        api_response: { anthropic: response },
        error: null,
      })
      .select("id")
      .single();

    if (runError || !run?.id) {
      throw new Error(`Unable to store Instagram agent run: ${runError?.message ?? "missing run id"}`);
    }
    runId = run.id as string;

    // Only real DMs the model chose to answer, at low risk, are auto-sent.
    // Public comments stay dry-run and everything is gated by IG_AGENT_DRY_RUN.
    const canSend =
      !dryRun &&
      input.sourceType === "dm" &&
      decision.should_reply &&
      decision.risk_level === "low" &&
      Boolean(decision.reply);

    if (!canSend || !decision.reply) return;

    const delivery = await sendInstagramDirectMessage(input.contactId, decision.reply);

    // Delivery succeeded — mark the run sent BEFORE any further bookkeeping so a
    // downstream write error can never relabel a message Instagram actually got.
    const { error: updateError } = await supabase
      .from("chs_ig_agent_runs")
      .update({
        sent: true,
        api_response: { anthropic: response, instagram: delivery },
        error: null,
      })
      .eq("id", runId);

    if (updateError) {
      console.error("[instagram-agent] reply sent but run update failed", updateError.message);
    }

    // Best-effort bookkeeping. The DM is already out the door, so failures here
    // are logged, not thrown — throwing would drop into the catch and wrongly
    // mark a delivered reply as failed.
    const { error: messageError } = await supabase.from("chs_ig_messages").insert({
      platform_message_id: delivery.message_id,
      contact_id: input.contactId,
      direction: "outbound",
      source_type: "dm",
      text_content: decision.reply,
      raw_payload: delivery,
    });

    if (messageError && messageError.code !== "23505") {
      console.error("[instagram-agent] reply sent but message store failed", messageError.message);
    }

    const nowIso = new Date().toISOString();
    const { error: contactError } = await supabase
      .from("chs_ig_contacts")
      .update({ last_outbound_at: nowIso, updated_at: nowIso })
      .eq("ig_scoped_user_id", input.contactId);

    if (contactError) {
      console.error("[instagram-agent] reply sent but contact update failed", contactError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (runId) {
      const { error: updateError } = await supabase
        .from("chs_ig_agent_runs")
        .update({ sent: false, error: message.slice(0, 2000) })
        .eq("id", runId);
      if (updateError) console.error("[instagram-agent] unable to update failed run", updateError.message);
    } else {
      const { error: insertError } = await supabase.from("chs_ig_agent_runs").insert({
        webhook_event_id: input.webhookEventId,
        contact_id: input.contactId,
        intent: "error",
        risk_level: "high",
        should_reply: false,
        should_mention_fanvue: false,
        generated_reply: null,
        sent: false,
        dry_run: dryRun,
        model: MODEL,
        api_response: null,
        error: message.slice(0, 2000),
      });

      if (insertError) console.error("[instagram-agent] unable to store failed run", insertError.message);
    }

    console.error("[instagram-agent] generation or delivery failed", message);
  }
}

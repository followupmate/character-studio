import { requireEnv } from "@/lib/env";

type InstagramSendResponse = {
  message_id?: string;
  recipient_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export async function sendInstagramDirectMessage(recipientId: string, text: string): Promise<InstagramSendResponse> {
  const igUserId = requireEnv("IG_USER_ID");
  const accessToken = requireEnv("IG_ACCESS_TOKEN");
  const apiVersion = process.env.IG_GRAPH_API_VERSION || "v23.0";
  const endpoint = `https://graph.instagram.com/${apiVersion}/${encodeURIComponent(igUserId)}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as InstagramSendResponse;

  if (!response.ok || payload.error) {
    const detail = payload.error?.message || `HTTP ${response.status}`;
    throw new Error(`Instagram message delivery failed: ${detail}`);
  }

  if (!payload.message_id) {
    throw new Error("Instagram message delivery failed: missing message_id");
  }

  return payload;
}

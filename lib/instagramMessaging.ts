import { getIgAccessToken } from "@/lib/igToken";

// Instagram API with Instagram Login — send API.
// POST https://graph.instagram.com/<version>/<IG_USER_ID>/messages
// body: { recipient: { id: <IGSID> }, message: { text } }
//
// The access token is read via getIgAccessToken() (DB-first, kept fresh by the
// weekly refresh cron), NOT straight from IG_ACCESS_TOKEN. An env token can't be
// rewritten at runtime, which is exactly why the account once silently stopped
// posting when the env token lapsed — outbound DMs must not repeat that mistake.

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

export async function sendInstagramDirectMessage(
  recipientId: string,
  text: string
): Promise<InstagramSendResponse> {
  const igUserId = process.env.IG_USER_ID;
  const accessToken = await getIgAccessToken();
  if (!igUserId || !accessToken) {
    throw new Error("Instagram message delivery failed: IG_USER_ID or IG access token not set");
  }

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

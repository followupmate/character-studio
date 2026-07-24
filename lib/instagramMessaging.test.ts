import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/igToken", () => ({
  getIgAccessToken: vi.fn(async () => "refreshed-token"),
}));

import { getIgAccessToken } from "@/lib/igToken";
import { sendInstagramDirectMessage } from "@/lib/instagramMessaging";

const mockedToken = vi.mocked(getIgAccessToken);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sendInstagramDirectMessage", () => {
  beforeEach(() => {
    process.env.IG_USER_ID = "17841400000000000";
    delete process.env.IG_GRAPH_API_VERSION;
    mockedToken.mockResolvedValue("refreshed-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts to the graph.instagram.com messages endpoint using the refreshed token", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ message_id: "mid.abc", recipient_id: "998" })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendInstagramDirectMessage("998", "ahoj");

    expect(result.message_id).toBe("mid.abc");
    expect(mockedToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(
      "https://graph.instagram.com/v23.0/17841400000000000/messages"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer refreshed-token" });
    expect(JSON.parse(String(init.body))).toEqual({
      recipient: { id: "998" },
      message: { text: "ahoj" },
    });
  });

  it("honours IG_GRAPH_API_VERSION override", async () => {
    process.env.IG_GRAPH_API_VERSION = "v21.0";
    const fetchMock = vi.fn(async () => jsonResponse({ message_id: "mid.v21" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendInstagramDirectMessage("998", "ahoj");

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(String(url)).toContain("/v21.0/");
  });

  it("throws when Instagram returns an error payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { message: "Invalid OAuth access token" } }, 400))
    );

    await expect(sendInstagramDirectMessage("998", "ahoj")).rejects.toThrow(
      /Invalid OAuth access token/
    );
  });

  it("throws when the response omits a message_id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ recipient_id: "998" })));

    await expect(sendInstagramDirectMessage("998", "ahoj")).rejects.toThrow(
      /missing message_id/
    );
  });

  it("throws when no access token is available", async () => {
    mockedToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInstagramDirectMessage("998", "ahoj")).rejects.toThrow(
      /IG access token not set/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

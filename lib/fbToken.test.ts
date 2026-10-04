import { describe, it, expect, beforeEach } from "vitest";
import { _resetFbTokenCache, checkTokenHealth, classifyTokenHealth, redactSecrets, resolveFbPageToken } from "./fbToken";

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
const DAY = 86_400_000;

beforeEach(() => _resetFbTokenCache());

describe("resolveFbPageToken", () => {
  it("uses FB_PAGE_ACCESS_TOKEN without any network call", async () => {
    let calls = 0;
    const r = await resolveFbPageToken({ env: { FB_PAGE_ACCESS_TOKEN: "PAGE" }, fetchImpl: async () => (calls++, json({})) });
    expect(r).toEqual({ token: "PAGE", source: "env_page_token" });
    expect(calls).toBe(0);
  });

  it("derives the page token from the user token via me/accounts (matching the IG user id), then caches it", async () => {
    const urls: string[] = [];
    const fetchImpl = async (u: string) => (
      urls.push(u),
      json({ data: [{ id: "other", access_token: "WRONG", instagram_business_account: { id: "999" } }, { id: "1335779962949618", access_token: "PAGE_TOK", instagram_business_account: { id: "IGID" } }] })
    );
    const env = { FB_LONG_LIVED_USER_TOKEN: "USER_TOKEN_123456", FB_IG_USER_ID: "IGID" };
    const r = await resolveFbPageToken({ env, fetchImpl });
    expect(r).toEqual({ token: "PAGE_TOK", source: "derived_from_user_token" });
    expect(urls[0]).toContain("https://graph.facebook.com/v25.0/me/accounts?");
    await resolveFbPageToken({ env, fetchImpl });
    expect(urls).toHaveLength(1);
  });

  it("returns null with no token configured or when no page matches", async () => {
    expect(await resolveFbPageToken({ env: {} })).toBeNull();
    const fetchImpl = async () => json({ data: [{ id: "x", access_token: "T", instagram_business_account: { id: "1" } }] });
    expect(await resolveFbPageToken({ env: { FB_LONG_LIVED_USER_TOKEN: "U_aaaaaa", FB_IG_USER_ID: "2" }, fetchImpl })).toBeNull();
  });

  it("throws a redacted error when me/accounts fails", async () => {
    const fetchImpl = async () => {
      throw new Error("fetch failed https://graph.facebook.com/v25.0/me/accounts?access_token=SECRETSECRET&x=1");
    };
    const err = (await resolveFbPageToken({ env: { FB_LONG_LIVED_USER_TOKEN: "U_bbbbbb" }, fetchImpl }).catch((e) => e)) as Error;
    expect(err.message).not.toContain("SECRETSECRET");
    expect(err.message).toContain("REDACTED");
  });
});

describe("token health", () => {
  const now = Date.UTC(2026, 9, 4);
  it("never_expires for expires_at 0", () => {
    const h = classifyTokenHealth({ is_valid: true, type: "PAGE", expires_at: 0, scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"] }, now);
    expect(h.status).toBe("never_expires");
    expect(h.detail).toBeUndefined();
  });
  it("reports missing scopes", () => {
    expect(classifyTokenHealth({ is_valid: true, expires_at: 0, scopes: ["instagram_basic"] }, now).detail).toContain("instagram_content_publish");
  });
  it("expiring_soon / ok / expired / invalid", () => {
    expect(classifyTokenHealth({ is_valid: true, expires_at: (now + 5 * DAY) / 1000 }, now)).toMatchObject({ status: "expiring_soon", daysLeft: 5 });
    expect(classifyTokenHealth({ is_valid: true, expires_at: (now + 40 * DAY) / 1000 }, now).status).toBe("ok");
    expect(classifyTokenHealth({ is_valid: true, expires_at: (now - DAY) / 1000 }, now).status).toBe("expired");
    expect(classifyTokenHealth({ is_valid: false, error: { message: "Session invalidated" } }, now).status).toBe("invalid");
  });
  it("checkTokenHealth calls debug_token with the app token and never echoes the input token", async () => {
    let url = "";
    const fetchImpl = async (u: string) => ((url = u), json({ data: { is_valid: true, type: "PAGE", expires_at: 0 } }));
    const h = await checkTokenHealth("INPUT_TOKEN", { env: { FB_APP_ID: "1", FB_APP_SECRET: "s" }, fetchImpl, now: () => now });
    expect(url).toContain("/v25.0/debug_token?input_token=INPUT_TOKEN");
    expect(url).toContain(encodeURIComponent("1|s"));
    expect(h.status).toBe("never_expires");
    expect(JSON.stringify(h)).not.toContain("INPUT_TOKEN");
  });
  it("is 'unknown' without app credentials", async () => {
    expect((await checkTokenHealth("T", { env: {} })).status).toBe("unknown");
  });
});

describe("redactSecrets", () => {
  it("masks tokens in urls and bare EAA tokens", () => {
    expect(redactSecrets("x?access_token=abc123&y=1")).toBe("x?access_token=REDACTED&y=1");
    expect(redactSecrets("bad EAAJabcdefghijklmnopqrstuvwxyz1234 token")).not.toContain("EAAJabcdef");
  });
});

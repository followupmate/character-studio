import { describe, it, expect, afterEach } from "vitest";
import { cronAuthorized } from "./apiAuth";

const orig = process.env.CRON_SECRET;
afterEach(() => { process.env.CRON_SECRET = orig; });

function req(opts: { auth?: string; secretParam?: string } = {}): Request {
  const url = opts.secretParam ? `https://x.test/api?secret=${opts.secretParam}` : "https://x.test/api";
  return new Request(url, { headers: opts.auth ? { authorization: opts.auth } : {} });
}

describe("cronAuthorized (fail-closed)", () => {
  it("DENIES when CRON_SECRET is unset (old code opened here)", () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized(req({ auth: "Bearer whatever" }))).toBe(false);
  });

  it("accepts a matching Bearer token (Vercel cron / server-to-server)", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(cronAuthorized(req({ auth: "Bearer s3cr3t" }))).toBe(true);
  });

  it("accepts a matching ?secret= query param (cron-job.org)", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(cronAuthorized(req({ secretParam: "s3cr3t" }))).toBe(true);
  });

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(cronAuthorized(req({ auth: "Bearer nope", secretParam: "nope" }))).toBe(false);
  });

  it("rejects a request with no credentials", () => {
    process.env.CRON_SECRET = "s3cr3t";
    expect(cronAuthorized(req())).toBe(false);
  });
});

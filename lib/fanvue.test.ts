import { describe, expect, it } from "vitest";
import { extractPartUrl } from "@/lib/fanvue";

// Real shape of the live response (2026-07-25): the presigned URL as a bare string.
const PRESIGNED =
  "https://fanvue-raw-media-prod.s3-accelerate.amazonaws.com/user/media?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-SignedHeaders=host&partNumber=1&x-amz-checksum-crc32=AAAAAA%3D%3D&x-id=UploadPart";

describe("extractPartUrl", () => {
  it("accepts the live shape: a bare plain-text presigned URL", () => {
    expect(extractPartUrl(PRESIGNED)).toBe(PRESIGNED);
  });

  it("trims surrounding whitespace and newlines", () => {
    expect(extractPartUrl(`\n  ${PRESIGNED}\n`)).toBe(PRESIGNED);
  });

  it("accepts a JSON-quoted string URL", () => {
    expect(extractPartUrl(JSON.stringify(PRESIGNED))).toBe(PRESIGNED);
  });

  it("accepts an object wrapper with url / uploadUrl / signedUrl", () => {
    expect(extractPartUrl(JSON.stringify({ url: PRESIGNED }))).toBe(PRESIGNED);
    expect(extractPartUrl(JSON.stringify({ uploadUrl: PRESIGNED }))).toBe(PRESIGNED);
    expect(extractPartUrl(JSON.stringify({ signedUrl: PRESIGNED }))).toBe(PRESIGNED);
  });

  it("rejects bodies that are not a URL", () => {
    expect(extractPartUrl("")).toBeNull();
    expect(extractPartUrl("not a url")).toBeNull();
    expect(extractPartUrl(JSON.stringify({ error: "denied" }))).toBeNull();
    expect(extractPartUrl(JSON.stringify({ url: 42 }))).toBeNull();
  });
});

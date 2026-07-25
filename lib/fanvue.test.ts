import { describe, expect, it } from "vitest";
import { buildPartUrlCandidates, extractPartUrl, partUrlBuilders } from "@/lib/fanvue";

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

  it("accepts an array of URLs and picks the requested part index", () => {
    const second = PRESIGNED.replace("partNumber=1", "partNumber=2");
    expect(extractPartUrl(JSON.stringify([PRESIGNED, second]), 0)).toBe(PRESIGNED);
    expect(extractPartUrl(JSON.stringify([PRESIGNED, second]), 1)).toBe(second);
    // out-of-range index falls back to the first element
    expect(extractPartUrl(JSON.stringify([PRESIGNED]), 5)).toBe(PRESIGNED);
  });

  it("rejects bodies that are not a URL", () => {
    expect(extractPartUrl("")).toBeNull();
    expect(extractPartUrl("not a url")).toBeNull();
    expect(extractPartUrl(JSON.stringify({ error: "denied" }))).toBeNull();
    expect(extractPartUrl(JSON.stringify({ url: 42 }))).toBeNull();
    expect(extractPartUrl(JSON.stringify(["not-a-url"]))).toBeNull();
  });
});

describe("buildPartUrlCandidates", () => {
  it("tries the prod-verified route first, walks both bases, and dedupes the session base", () => {
    const c = buildPartUrlCandidates("/media/uploads", "abc_def.123", 1);
    // prod-verified 2026-07-26: /media/uploads/{uploadId}/parts/{n}/url
    expect(c[0]).toBe("/media/uploads/abc_def.123/parts/1/url");
    expect(c[1]).toBe("/medias/uploads/abc_def.123/parts/1/url");
    // fallbacks still present, including the route that 404s in prod
    expect(c).toContain("/media/uploads/abc_def.123/part-urls/1");
    expect(c).toContain("/media/uploads/abc_def.123/parts/1");
    // no duplicates when sessionBase equals a built-in base
    expect(new Set(c).size).toBe(c.length);
  });

  it("reuses the winning builder for later parts without touching the upload ID", () => {
    // Regression: an opaque uploadId can start with the part number ("1abc…").
    // Deriving part 2's path by string-replacing "/1" rewrote the upload ID instead.
    const uploadId = "1abc_def.xyz";
    const build = partUrlBuilders("/media/uploads", uploadId)[0];
    expect(build(1)).toBe(`/media/uploads/${uploadId}/parts/1/url`);
    expect(build(2)).toBe(`/media/uploads/${uploadId}/parts/2/url`);
    expect(build(2)).toContain(`/${uploadId}/`);
    expect(build(2)).not.toContain("/2abc_def.xyz/");
  });

  it("keeps an unknown session base as the first candidate base", () => {
    const c = buildPartUrlCandidates("/medias/upload-sessions", "id1", 3);
    expect(c[0]).toBe("/medias/upload-sessions/id1/parts/3/url");
    expect(c).toContain("/media/uploads/id1/parts/3/url");
    expect(c).toContain("/medias/uploads/id1/parts/3");
  });
});

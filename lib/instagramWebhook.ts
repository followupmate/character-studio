import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function verifyInstagramSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const providedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const provided = Buffer.from(providedHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function buildInstagramEventKey(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export function getInstagramEventType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const object = payload as Record<string, unknown>;
  const entry = Array.isArray(object.entry) ? object.entry[0] : undefined;
  if (!entry || typeof entry !== "object") return String(object.object ?? "unknown");

  const entryObject = entry as Record<string, unknown>;
  if (Array.isArray(entryObject.messaging) && entryObject.messaging.length > 0) return "message";
  if (Array.isArray(entryObject.changes) && entryObject.changes.length > 0) {
    const firstChange = entryObject.changes[0];
    if (firstChange && typeof firstChange === "object") {
      const field = (firstChange as Record<string, unknown>).field;
      if (typeof field === "string") return field;
    }
    return "change";
  }

  return String(object.object ?? "unknown");
}
